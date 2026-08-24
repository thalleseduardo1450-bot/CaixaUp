/**
 * Arquivo: src/pages/Admin/SalesStartPage.tsx
 * Objetivo: frente de caixa — lançar itens, fechar a venda, receber e dar troco.
 * Entradas esperadas: nome do operador, modo standalone e callbacks de saída/navegação.
 *
 * ORGANIZAÇÃO
 * Esta página é só o maestro. A regra fica nos hooks e o desenho nos componentes:
 *   hooks/Pdv/usePdvCart      → carrinho, rascunho, vendas suspensas
 *   hooks/Pdv/usePdvProducts  → catálogo, busca sem acento, favoritos, mais usados
 *   hooks/Pdv/usePdvShortcuts → teclas de função
 *   components/Pdv/*          → barra, busca, grade, cupom, pagamento, estados
 *
 * O QUE MUDOU EM RELAÇÃO À VERSÃO ANTERIOR
 *  - Dinheiro em centavos inteiros: acabou o "falta distribuir R$ 0,00".
 *  - Troco voltou a existir: campo de valor recebido, cálculo ao vivo e cupom
 *    com o valor certo (antes ia `change: 0` fixo).
 *  - Cores por token do tema: a tela acompanha claro/escuro do resto do app.
 *  - Estados de verdade: caixa fechado e falha de carga ocupam a tela em vez de
 *    virar um aviso pequeno com botões que não funcionam.
 *  - Saiu ~560 linhas de código inalcançável que existiam depois de um `return`.
 *
 * LIMITE CONSCIENTE
 * A API aceita por item apenas { productCode, productName, quantity } e a coluna
 * de quantidade é inteira. Por isso desconto por item e venda por peso NÃO estão
 * aqui: seriam campos que a tela mostra e o banco joga fora. Exigem alteração de
 * API e de schema para funcionar de verdade.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Printer, RotateCcw, X } from "lucide-react";

import type { PageKey } from "@/components/AppSidebar/AppSidebar";
import {
  printSaleReceipt,
  type SaleReceipt,
} from "@/components/Admin/ReceiptPreviewModal";
import SaleSuccessModal from "@/components/Admin/SaleSuccessModal";
import PdvCart from "@/components/Pdv/PdvCart";
import PdvCheckoutModal, {
  type PdvCheckoutResult,
} from "@/components/Pdv/PdvCheckoutModal";
import PdvProductGrid from "@/components/Pdv/PdvProductGrid";
import PdvSearchBar from "@/components/Pdv/PdvSearchBar";
import PdvShortcutsHelp from "@/components/Pdv/PdvShortcutsHelp";
import {
  PdvClosedRegisterState,
  PdvErrorState,
  PdvLoadingState,
} from "@/components/Pdv/PdvStates";
import PdvSuspendedSalesModal from "@/components/Pdv/PdvSuspendedSalesModal";
import PdvTopBar from "@/components/Pdv/PdvTopBar";
import { Toast, useStatusDialog } from "@/hooks/Dialog";
import useInputMasks from "@/hooks/InputMasks/useInputMasks";
import { usePdvCart } from "@/hooks/Pdv/usePdvCart";
import { usePdvProducts } from "@/hooks/Pdv/usePdvProducts";
import { usePdvShortcuts } from "@/hooks/Pdv/usePdvShortcuts";
import {
  cashRegisterService,
  type CashRegisterStatusDto,
} from "@/services/api/cashRegisterService";
import { companyService, type CompanyDto } from "@/services/api/companyService";
import { customerService, type CustomerDto } from "@/services/api/customerService";
import { salesHistoryService } from "@/services/api/salesHistoryService";
import type { PdvProduct, PdvProductViewMode } from "@/types/pdv";
import { centsToApi, formatCentsBrl, toReais } from "@/utils/pdvMoney";
import {
  getSellWithoutStockEnabled,
} from "@/utils/pdvPreferences";
import { playBeepError, playBeepSuccess, playSaleComplete } from "@/utils/pdvSound";
import {
  getDensity,
  getGridColumns,
  getSoundEnabled,
  getViewMode,
  setDensity as persistDensity,
  setSoundEnabled as persistSoundEnabled,
  setViewMode as persistViewMode,
} from "@/utils/pdvViewPreferences";

type SalesStartPageProps = {
  onExit?: () => void;
  onNavigate?: (page: PageKey) => void;
  standalone?: boolean;
  operatorName?: string;
  themeMode?: "light" | "dark";
  onToggleTheme?: () => void;
};

const LAST_RECEIPT_STORAGE_KEY = "horus-pdv-last-receipt";

/**
 * Último cupom salvo, lido antes do primeiro render (é o estado inicial, não um
 * efeito): assim o botão "Reimprimir última venda" já nasce habilitado quando
 * existe cupom, em vez de piscar desabilitado por um render.
 */
function readLastReceipt(): SaleReceipt | null {
  try {
    const stored = window.localStorage.getItem(LAST_RECEIPT_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as SaleReceipt) : null;
  } catch {
    window.localStorage.removeItem(LAST_RECEIPT_STORAGE_KEY);
    return null;
  }
}

function formatCashElapsed(minutes?: number) {
  if (!minutes || minutes < 1) return "menos de 1 min";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}min`;
}

export default function SalesStartPage({
  onExit,
  onNavigate,
  standalone = false,
  operatorName = "Operador",
  themeMode = "light",
  onToggleTheme,
}: SalesStartPageProps) {
  const { formatMoneyBr } = useInputMasks();
  const statusDialog = useStatusDialog();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  /* ------------------------- preferências do operador ------------------------- */

  const [viewMode, setViewMode] = useState<PdvProductViewMode>(() => getViewMode());
  const [density, setDensity] = useState(() => getDensity());
  const [soundEnabled, setSoundEnabled] = useState(() => getSoundEnabled());
  const [gridColumns] = useState(() => getGridColumns());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [sellWithoutStockEnabled, setSellWithoutStockEnabled] = useState(() =>
    getSellWithoutStockEnabled(),
  );

  /* ------------------------- dados vindos da API ------------------------- */

  const products = usePdvProducts();
  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [cashStatus, setCashStatus] = useState<CashRegisterStatusDto | null>(null);
  const [cashChecked, setCashChecked] = useState(false);

  /* ------------------------- estado da venda ------------------------- */

  const cart = usePdvCart({
    allowSellingWithoutStock: sellWithoutStockEnabled,
    operatorName,
  });

  const [query, setQuery] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [activeCategory, setActiveCategory] = useState("");
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [cpfOnReceipt, setCpfOnReceipt] = useState("");

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [suspendedOpen, setSuspendedOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [lastReceipt, setLastReceipt] = useState<SaleReceipt | null>(readLastReceipt);
  const [successSale, setSuccessSale] = useState<SaleReceipt | null>(null);

  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  );

  /* ------------------------- efeitos de carga ------------------------- */

  const loadCashStatus = useCallback(async () => {
    try {
      const status = await cashRegisterService.status();
      setCashStatus(status ?? null);
      return status ?? null;
    } catch {
      setCashStatus(null);
      return null;
    } finally {
      setCashChecked(true);
    }
  }, []);

  useEffect(() => {
    void loadCashStatus();
  }, [loadCashStatus]);

  useEffect(() => {
    companyService
      .get()
      .then((data) => {
        if (data) setCompany(data);
      })
      .catch(() => {
        // Dado só do cupom: a venda não depende disso, então não alarma o operador.
      });

    customerService
      .list()
      .then(setCustomers)
      .catch(() => {
        Toast.info("Lista de clientes indisponível. A venda segue como consumidor.");
      });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(
        new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      );
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  /** Foco no campo de leitura: o leitor de código depende disso para funcionar. */
  useEffect(() => {
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 150);
    return () => window.clearTimeout(timer);
  }, []);

  /** Preferências mudam na tela de Configurações; aqui só escutamos os avisos. */
  useEffect(() => {
    const syncStock = () => setSellWithoutStockEnabled(getSellWithoutStockEnabled());

    window.addEventListener("horus-pdv-sell-without-stock-change", syncStock);

    return () => {
      window.removeEventListener("horus-pdv-sell-without-stock-change", syncStock);
    };
  }, []);

  /** Aviso ao fechar a aba do PDV com venda em andamento. */
  useEffect(() => {
    if (!standalone) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (cart.isEmpty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [cart.isEmpty, standalone]);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  /* ------------------------- derivados ------------------------- */

  const quantityToAdd = useMemo(() => {
    const parsed = Number(quantityInput);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
  }, [quantityInput]);

  const visibleProducts = useMemo(
    () => products.filter({ query, category: activeCategory, viewMode }),
    [activeCategory, products, query, viewMode],
  );

  const idsInCart = useMemo(() => cart.items.map((item) => item.id), [cart.items]);

  const cashCanSell = cashStatus?.canSell === true;
  const cashStatusLabel = !cashChecked
    ? "Verificando caixa..."
    : cashCanSell
      ? `Caixa aberto há ${formatCashElapsed(cashStatus?.currentSession?.elapsedMinutes)}`
      : cashStatus?.blockReason || "Caixa fechado";

  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  /* ------------------------- ações ------------------------- */

  const beep = useCallback(
    (kind: "ok" | "erro") => {
      if (!soundEnabled) return;
      if (kind === "ok") playBeepSuccess();
      else playBeepError();
    },
    [soundEnabled],
  );

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  /** Abre a pesquisa colocando o foco no campo de leitura. */
  const openCatalog = useCallback(() => {
    window.setTimeout(focusSearch, 0);
  }, [focusSearch]);

  const addProduct = useCallback(
    (product: PdvProduct, amount = 1) => {
      const result = cart.addProduct(product, amount);
      if (!result.ok) {
        beep("erro");
        Toast.error(result.message);
        return false;
      }
      products.trackUsage(product.id);
      beep("ok");
      setSelectedCartId(product.id);
      setQuery("");
      setQuantityInput("1");
      focusSearch();
      return true;
    },
    [beep, cart, focusSearch, products],
  );

  /**
   * Caminho do leitor de código de barras: código exato encontrado entra sozinho.
   * O atraso curto espera o leitor terminar de "digitar" antes de decidir.
   */
  useEffect(() => {
    const typed = query.trim();
    if (!typed) return;
    const exact = products.findByExactCode(typed);
    if (!exact) return;

    const timer = window.setTimeout(() => addProduct(exact, quantityToAdd), 120);
    return () => window.clearTimeout(timer);
    // addProduct muda a cada render; usar aqui reiniciaria o timer em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, products.products]);

  /** Enter no campo de busca: código exato, ou o único resultado da lista. */
  const submitSearch = useCallback(() => {
    const typed = query.trim();
    if (!typed) {
      Toast.info("Bipe o código ou digite parte do nome do produto.");
      return;
    }

    const exact = products.findByExactCode(typed);
    if (exact) {
      addProduct(exact, quantityToAdd);
      return;
    }

    if (visibleProducts.length === 1) {
      addProduct(visibleProducts[0], quantityToAdd);
      return;
    }

    if (visibleProducts.length === 0) {
      beep("erro");
      Toast.error(`Nenhum produto encontrado para "${typed}".`);
      return;
    }

    Toast.info(
      `${visibleProducts.length} produtos encontrados. Toque no produto desejado.`,
    );
  }, [addProduct, beep, products, quantityToAdd, query, visibleProducts]);

  const cancelSale = useCallback(async () => {
    if (cart.isEmpty) return;
    const confirmed = await statusDialog.confirm(
      `Cancelar a venda atual com ${cart.itemCount} item(ns), total de ${formatCentsBrl(cart.totalCents)}?`,
      { confirmIntent: "warning", confirmLabel: "Cancelar venda", cancelLabel: "Voltar" },
    );
    if (!confirmed) return;
    cart.clear();
    setCustomerId("");
    setCpfOnReceipt("");
    setCheckoutOpen(false);
    Toast.info("Venda cancelada.");
    focusSearch();
  }, [cart, focusSearch, statusDialog]);

  const suspendSale = useCallback(() => {
    if (cart.isEmpty) {
      Toast.info("Não há itens para suspender.");
      return;
    }
    const suspended = cart.suspendCurrent({
      customerId,
      customerName: selectedCustomer?.customerName ?? "",
    });
    if (!suspended) return;
    setCustomerId("");
    setCpfOnReceipt("");
    Toast.success("Venda suspensa. Use F6 para retomar.");
    focusSearch();
  }, [cart, customerId, focusSearch, selectedCustomer]);

  const resumeSale = useCallback(
    (id: string) => {
      const resumed = cart.resumeSuspended(id, {
        customerId,
        customerName: selectedCustomer?.customerName ?? "",
      });
      if (!resumed) {
        Toast.error("Esta venda suspensa não está mais disponível.");
        return;
      }
      setCustomerId(resumed.customerId);
      setSuspendedOpen(false);
      Toast.success(`${resumed.label} retomada.`);
      focusSearch();
    },
    [cart, customerId, focusSearch, selectedCustomer],
  );

  const openCheckout = useCallback(async () => {
    if (cart.isEmpty) {
      Toast.error("Adicione ao menos um item antes de finalizar.");
      return;
    }

    // Revalida o caixa no momento do fechamento: alguém pode ter fechado o turno
    // em outra estação enquanto esta venda estava em andamento.
    const status = await loadCashStatus();
    if (!status?.canSell) {
      Toast.error(status?.blockReason || "Abra o caixa antes de finalizar a venda.");
      return;
    }

    setCheckoutOpen(true);
  }, [cart.isEmpty, loadCashStatus]);

  const confirmPayment = useCallback(
    async (payment: PdvCheckoutResult) => {
      if (isSubmitting) return;
      setIsSubmitting(true);

      try {
        const status = await loadCashStatus();
        if (!status?.canSell) {
          Toast.error(status?.blockReason || "Abra o caixa antes de confirmar a venda.");
          return;
        }

        const documentOnReceipt =
          payment.customerDocument || cpfOnReceipt.trim() || "-";

        const result = await salesHistoryService.register({
          customerId: payment.customerId,
          customerName: payment.customerName || "Consumidor",
          customerCpf: documentOnReceipt,
          paymentType: payment.paymentType,
          // Valor COM desconto: é o que o banco usa para calcular
          // `vendas.desconto` (subtotal dos itens menos este total).
          totalAmount: centsToApi(payment.totalToPayCents),
          operatorName,
          allowSellingWithoutStock: sellWithoutStockEnabled,
          payments: payment.lines.map((line) => ({
            forma: line.type,
            valor: toReais(line.amountCents),
          })),
          items: cart.items.map((item) => ({
            productCode: item.code,
            productName: item.name,
            quantity: item.quantity,
          })),
        });

        // O cupom guarda dinheiro em reais (contrato antigo do componente),
        // então a conversão de centavos acontece só aqui, na borda.
        const receipt: SaleReceipt = {
          saleNumber: result?.saleNumber || `PDV-${Date.now()}`,
          issuedAt: new Date().toISOString(),
          company: company
            ? {
                fantasyName: company.fantasyName,
                corporateName: company.corporateName,
                cnpj: company.cnpj,
                address: company.address,
                number: company.number,
                neighborhood: company.neighborhood,
                city: company.city,
                uf: company.uf,
                phone: company.phone,
                sacPhone: company.sacPhone,
              }
            : null,
          customerCpf: documentOnReceipt,
          paymentType: payment.paymentType,
          paymentLabel: payment.paymentLabel,
          paymentLines: payment.lines.map((line) => ({
            label:
              ({
                dinheiro: "Dinheiro",
                pix: "Pix",
                debito: "Cartão de débito",
                credito: "Cartão de crédito",
                cheque: "Cheque",
                fiado: "Fiado",
                outros: "Outros meios",
              } as Record<string, string>)[line.type] ?? line.type,
            amount: toReais(line.amountCents),
          })),
          operatorName,
          subtotal: toReais(cart.totalCents),
          discount: toReais(payment.discountCents),
          total: toReais(payment.totalToPayCents),
          cashGiven: toReais(payment.cashGivenCents),
          change: toReais(payment.changeCents),
          items: cart.items.map((item) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            quantity: item.quantity,
            unitPrice: toReais(item.unitPriceCents),
            total: toReais(item.unitPriceCents * item.quantity),
          })),
        };

        setCheckoutOpen(false);
        cart.clear();
        setCustomerId("");
        setCpfOnReceipt("");
        setQuery("");
        setQuantityInput("1");
        setSelectedCartId(null);

        setLastReceipt(receipt);
        try {
          window.localStorage.setItem(
            LAST_RECEIPT_STORAGE_KEY,
            JSON.stringify(receipt),
          );
        } catch {
          /* fica só em memória se o storage estiver bloqueado */
        }

        if (soundEnabled) playSaleComplete();
        setSuccessSale(receipt);
        void products.reload();

      } catch (error) {
        Toast.error(
          error instanceof Error ? error.message : "Erro ao registrar a venda.",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      cart,
      company,
      cpfOnReceipt,
      formatMoneyBr,
      isSubmitting,
      loadCashStatus,
      operatorName,
      products,
      sellWithoutStockEnabled,
      soundEnabled,
    ],
  );

  const reprintLastSale = useCallback(async () => {
    if (!lastReceipt) {
      Toast.info("Nenhuma venda finalizada nesta estação.");
      return;
    }
    const shouldPrint = await statusDialog.confirm(
      `Imprimir novamente o cupom da venda ${lastReceipt.saleNumber}?`,
      { confirmIntent: "success", confirmLabel: "Imprimir", cancelLabel: "Não" },
    );
    if (shouldPrint) printSaleReceipt(lastReceipt, formatMoneyBr);
  }, [formatMoneyBr, lastReceipt, statusDialog]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void document.documentElement.requestFullscreen().catch(() => {
      Toast.info("O navegador não permitiu tela cheia nesta janela.");
    });
  }, []);

  const handleViewModeChange = useCallback((mode: PdvProductViewMode) => {
    setViewMode(mode);
    persistViewMode(mode);
  }, []);

  const toggleDensity = useCallback(() => {
    setDensity((current) => {
      const next = current === "confortavel" ? "compacta" : "confortavel";
      persistDensity(next);
      return next;
    });
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => {
      persistSoundEnabled(!current);
      return !current;
    });
  }, []);

  /* ------------------------- navegação pelo cupom ------------------------- */

  const moveSelection = useCallback(
    (direction: -1 | 1) => {
      if (cart.items.length === 0) return;
      const currentIndex = cart.items.findIndex((item) => item.id === selectedCartId);
      const nextIndex =
        currentIndex < 0
          ? direction === 1
            ? 0
            : cart.items.length - 1
          : Math.min(cart.items.length - 1, Math.max(0, currentIndex + direction));
      setSelectedCartId(cart.items[nextIndex].id);
    },
    [cart.items, selectedCartId],
  );

  const adjustSelected = useCallback(
    (delta: 1 | -1) => {
      const targetId = selectedCartId ?? cart.items.at(-1)?.id;
      if (!targetId) return;
      setSelectedCartId(targetId);
      if (delta === 1) cart.increment(targetId);
      else cart.decrement(targetId);
    },
    [cart, selectedCartId],
  );

  /* ------------------------- atalhos ------------------------- */

  const anyOverlayOpen = checkoutOpen || suspendedOpen || helpOpen || Boolean(successSale);

  usePdvShortcuts({
    enabled: !anyOverlayOpen,
    handlers: {
      onToggleHelp: () => setHelpOpen((current) => !current),
      onFocusSearch: openCatalog,
      onFocusCustomer: () => setCheckoutOpen(false),
      onFocusQuantity: () => {
        quantityInputRef.current?.focus();
        quantityInputRef.current?.select();
      },
      onOpenSuspended: () => setSuspendedOpen(true),
      onSuspendSale: suspendSale,
      onCancelSale: () => void cancelSale(),
      onOpenCheckout: () => void openCheckout(),
      onRemoveSelected: () => {
        if (selectedCartId) cart.removeItem(selectedCartId);
      },
      onMoveSelection: moveSelection,
      onAdjustSelected: adjustSelected,
      onEscape: () => onExit?.(),
    },
  });

  /**
   * LEITOR DE CÓDIGO DE BARRAS EM QUALQUER LUGAR DA TELA
   *
   * O leitor é um teclado: ele "digita" o código no elemento que tem o foco. Se o
   * operador clicou num produto, num botão ou na lista do cupom antes de bipar, a
   * leitura ia para o vazio e o produto simplesmente não entrava — o caixa bipava
   * de novo achando que o leitor falhou.
   *
   * Aqui a primeira tecla imprimível digitada FORA de um campo de texto devolve o
   * foco ao campo de leitura e entra nele na mão (preventDefault + append, para
   * não depender de o navegador redirecionar o caractere no meio do evento). As
   * teclas seguintes da rajada já caem no campo certo, e o efeito de código exato
   * lança o produto sozinho.
   */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (anyOverlayOpen) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      // Tecla imprimível tem key de 1 caractere: exclui F2, setas, Tab, Enter.
      if (event.key.length !== 1) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }

      const input = searchInputRef.current;
      if (!input) return;

      event.preventDefault();
      input.focus();
      setQuery(`${input.value}${event.key}`);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [anyOverlayOpen]);

  /* ------------------------- render ------------------------- */

  const topBar = (
    <PdvTopBar
      operatorName={operatorName}
      cashStatusLabel={cashStatusLabel}
      cashIsOpen={cashCanSell}
      clock={clock}
      themeMode={themeMode}
      density={density}
      soundEnabled={soundEnabled}
      isFullscreen={isFullscreen}
      onToggleTheme={() => onToggleTheme?.()}
      onToggleDensity={toggleDensity}
      onToggleSound={toggleSound}
      onToggleFullscreen={toggleFullscreen}
      onOpenHelp={() => setHelpOpen(true)}
      onOpenManagement={() => onNavigate?.("cadastro-produto")}
      onExit={() => onExit?.()}
    />
  );

  /* Estados que ocupam a tela inteira, na ordem em que travam a venda. */
  if (products.isLoading && products.products.length === 0) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-bg-primary text-text-primary">
        {topBar}
        <PdvLoadingState />
      </div>
    );
  }

  if (products.loadError && products.products.length === 0) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-bg-primary text-text-primary">
        {topBar}
        <PdvErrorState message={products.loadError} onRetry={() => void products.reload()} />
      </div>
    );
  }

  if (cashChecked && !cashCanSell) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-bg-primary text-text-primary">
        {topBar}
        <PdvClosedRegisterState
          reason={cashStatus?.blockReason ?? ""}
          onOpenCashRegister={() => onNavigate?.("caixa")}
          onRetry={() => void loadCashStatus()}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] min-h-[620px] flex-col overflow-hidden bg-bg-primary text-text-primary">
      {topBar}

      {/* Recuperação de rascunho: só aparece se realmente houver o que recuperar */}
      {cart.recoverableItems && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-accent/40 bg-accent/10 px-4 py-2.5">
          <RotateCcw size={19} className="text-accent" aria-hidden="true" />
          <p className="flex-1 text-sm text-text-primary">
            Havia uma venda em andamento com{" "}
            <strong>{cart.recoverableItems.length} item(ns)</strong> quando a tela
            fechou. Deseja continuar de onde parou?
          </p>
          <button
            type="button"
            onClick={cart.acceptRecovery}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-hover-accent"
          >
            Recuperar venda
          </button>
          <button
            type="button"
            onClick={cart.dismissRecovery}
            aria-label="Descartar rascunho"
            className="grid h-9 w-9 place-items-center rounded-lg border border-border-secondary text-text-secondary transition hover:border-primary hover:text-primary"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* A barra de leitura permanece sempre montada para receber o código. */}
      <PdvSearchBar
        ref={searchInputRef}
        quantityRef={quantityInputRef}
        query={query}
        onQueryChange={setQuery}
        onSubmit={submitSearch}
        quantity={quantityInput}
        onQuantityChange={setQuantityInput}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        categories={products.categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        resultCount={visibleProducts.length}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Catálogo sempre visível */}
        <section className="flex min-h-0 flex-1 flex-col">
            <PdvProductGrid
              products={visibleProducts}
              viewMode={viewMode === "lista" ? "lista" : "grade"}
              density={density}
              columns={gridColumns}
              favoriteIds={products.favoriteIds}
              idsInCart={idsInCart}
              onSelectProduct={(product) => addProduct(product, quantityToAdd)}
              onToggleFavorite={products.toggleFavorite}
              emptyTitle={
                viewMode === "favoritos"
                  ? "Nenhum favorito ainda"
                  : viewMode === "mais-vendidos"
                    ? "Sem histórico neste terminal"
                    : "Nenhum produto encontrado"
              }
              emptyHint={
                viewMode === "favoritos"
                  ? "Toque na estrela de um produto para deixá-lo sempre à mão aqui."
                  : viewMode === "mais-vendidos"
                    ? "Depois das primeiras vendas, os itens que você mais lança aparecem aqui."
                    : query || activeCategory
                      ? "Confira a escrita ou limpe o filtro de categoria."
                      : "Cadastre produtos para começar a vender."
              }
              emptyActionLabel={
                viewMode === "grade" && !query && !activeCategory
                  ? "Importar produtos do Nex"
                  : undefined
              }
              onEmptyAction={() => onNavigate?.("cadastro-produto")}
            />
        </section>

        {/* Cupom divide a tela com o catálogo */}
        <div className="h-[46vh] shrink-0 lg:h-auto lg:w-[400px]">
          <PdvCart
            items={cart.items}
            totalCents={cart.totalCents}
            selectedId={selectedCartId ?? cart.lastTouchedId}
            onSelect={setSelectedCartId}
            onIncrement={cart.increment}
            onDecrement={cart.decrement}
            onRemove={cart.removeItem}
            onCheckout={() => void openCheckout()}
            onCancelSale={() => void cancelSale()}
            onSuspendSale={suspendSale}
            onOpenSuspended={() => setSuspendedOpen(true)}
            suspendedCount={cart.suspended.length}
            customerName={selectedCustomer?.customerName ?? ""}
            onOpenCustomer={() => void openCheckout()}
            checkoutDisabled={!cashCanSell || isSubmitting}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>

      {/*
        Rodapé utilitário: mora fora do catálogo porque "reimprimir a última
        venda" é o que o cliente pede na porta da loja — não pode depender de a
        grade de produtos estar aberta.
      */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border-primary bg-bg-light px-4 py-2">
        <button
          type="button"
          onClick={() => void reprintLastSale()}
          disabled={!lastReceipt}
          className="flex items-center gap-2 rounded-lg border border-border-secondary px-3 py-1.5 text-sm font-semibold text-text-secondary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Printer size={16} />
          Reimprimir última venda
        </button>
        <button
          type="button"
          onClick={() => void products.reload()}
          className="flex items-center gap-2 rounded-lg border border-border-secondary px-3 py-1.5 text-sm font-semibold text-text-secondary transition hover:border-accent hover:text-accent"
        >
          <RotateCcw size={16} />
          Atualizar catálogo
        </button>
        <span className="ml-auto text-xs text-text-tertiary">
          {sellWithoutStockEnabled
            ? "Venda sem estoque liberada nas configurações"
            : "Estoque validado a cada lançamento"}
        </span>
      </div>

      {/* ------------------------- sobreposições ------------------------- */}

      {checkoutOpen && (
        <PdvCheckoutModal
          totalCents={cart.totalCents}
          itemCount={cart.itemCount}
          customers={customers}
          initialCustomerId={customerId}
          cpfOnReceipt={cpfOnReceipt}
          onCpfChange={setCpfOnReceipt}
          isSubmitting={isSubmitting}
          onConfirm={(payment) => {
            setCustomerId(payment.customerId);
            void confirmPayment(payment);
          }}
          onClose={() => {
            setCheckoutOpen(false);
            focusSearch();
          }}
        />
      )}

      {suspendedOpen && (
        <PdvSuspendedSalesModal
          sales={cart.suspended}
          onResume={resumeSale}
          onDiscard={cart.discardSuspended}
          onClose={() => {
            setSuspendedOpen(false);
            focusSearch();
          }}
        />
      )}

      {helpOpen && <PdvShortcutsHelp onClose={() => setHelpOpen(false)} />}

      {successSale && (
        <SaleSuccessModal
          receipt={successSale}
          formatMoney={formatMoneyBr}
          onPrint={() => printSaleReceipt(successSale, formatMoneyBr)}
          onStartNewSale={() => {
            setSuccessSale(null);
            focusSearch();
          }}
        />
      )}

      {statusDialog.Dialog}
    </div>
  );
}
