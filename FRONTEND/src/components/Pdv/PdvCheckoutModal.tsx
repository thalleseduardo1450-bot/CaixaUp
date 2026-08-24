/**
 * Arquivo: src/components/Pdv/PdvCheckoutModal.tsx
 * Objetivo: fechar a venda — uma linha por forma de pagamento, valor digitável na linha, troco ao vivo.
 * Entradas esperadas: total em centavos, lista de clientes e o callback de confirmação.
 *
 * DESENHO: LISTA, NÃO GRADE
 * A tela anterior era uma grade de botões grandes + um campo de valor separado.
 * Funcionava, mas obrigava dois movimentos ("escolher a forma" e depois "digitar
 * o valor") e não deixava ver a divisão do pagamento de uma vez. Aqui cada forma
 * é uma linha com o próprio valor à direita — igual ao que o operador já conhece
 * de outros PDVs: abre com o total inteiro em Dinheiro, selecionado, e se ele só
 * quer dinheiro basta F2.
 *
 * COMO O VALOR SE DISTRIBUI (a regra toda)
 * A linha ativa é a "linha do saldo": ela mostra o que ainda falta para fechar.
 * Valor digitado numa linha vira valor FIXO daquela linha. Ao trocar de linha, a
 * sugestão da linha anterior é descartada (ela não foi digitada, era só saldo) e
 * a nova linha passa a mostrar o que falta. Assim R$ 50 em Dinheiro → seta para
 * Crédito → Crédito mostra 50,00, e não 0,00 com Dinheiro travado em 50.
 *
 * Tudo em centavos inteiros e comparado com `===`. Era daqui que vinha o antigo
 * "falta distribuir R$ 0,00": comparação de float com epsilon.
 *
 * O QUE O BANCO GUARDA
 * A tabela `pagamentos` aceita uma linha por forma (forma + valor), então a
 * divisão do pagamento é gravada de verdade — não mais concatenada numa string.
 * O fiado exige cliente identificado e registra a dívida na conta dele.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Calculator,
  CreditCard,
  FileText,
  Landmark,
  MoreHorizontal,
  Percent,
  QrCode,
  X,
} from "lucide-react";

import type { CustomerDto } from "@/services/api/customerService";
import type { PdvPaymentLine } from "@/types/pdv";
import {
  formatCents,
  formatCentsBrl,
  parseTypedCents,
  suggestChangeBreakdown,
} from "@/utils/pdvMoney";
import PdvNumericKeypad from "./PdvNumericKeypad";

export type PdvPaymentMethod = {
  value: string;
  label: string;
  icon: React.ReactNode;
  /** Classe que define --pdv-tone (cor do ícone) no index.css. */
  toneClass: string;
  /** Só dinheiro aceita valor maior que o devido (e gera troco). */
  allowsOverpay: boolean;
};

/**
 * As formas na ordem em que aparecem na lista. Fica sem `export` de propósito:
 * exportar valor de um arquivo de componente desliga o hot-reload dele no dev.
 */
const PDV_PAYMENT_METHODS: PdvPaymentMethod[] = [
  {
    value: "dinheiro",
    label: "Dinheiro",
    icon: <Banknote size={19} />,
    toneClass: "pdv-tone-cash",
    allowsOverpay: true,
  },
  {
    value: "credito",
    label: "Cartão de Crédito",
    icon: <CreditCard size={19} />,
    toneClass: "pdv-tone-credit",
    allowsOverpay: false,
  },
  {
    value: "debito",
    label: "Cartão de Débito",
    icon: <Landmark size={19} />,
    toneClass: "pdv-tone-debit",
    allowsOverpay: false,
  },
  {
    value: "pix",
    label: "Pix",
    icon: <QrCode size={19} />,
    toneClass: "pdv-tone-pix",
    allowsOverpay: false,
  },
  {
    value: "cheque",
    label: "Cheque",
    icon: <FileText size={19} />,
    toneClass: "pdv-tone-check",
    allowsOverpay: false,
  },
  {
    value: "outros",
    label: "Outros Meios",
    icon: <MoreHorizontal size={19} />,
    toneClass: "pdv-tone-other",
    allowsOverpay: false,
  },
];

export type PdvCheckoutResult = {
  /** "dinheiro" ou "dinheiro+credito" — mesma convenção já usada no histórico. */
  paymentType: string;
  /** "Dinheiro R$ 30,00 + Cartão de Crédito R$ 20,00" para o cupom. */
  paymentLabel: string;
  /** O que o cliente entregou em dinheiro (base do troco). */
  cashGivenCents: number;
  changeCents: number;
  discountCents: number;
  /** Total já com o desconto: é este valor que a venda registra. */
  totalToPayCents: number;
  customerId: string;
  customerName: string;
  customerDocument: string;
  /** Uma linha por forma, com o valor APLICADO (soma bate com totalToPayCents). */
  lines: PdvPaymentLine[];
};

type PdvCheckoutModalProps = {
  totalCents: number;
  itemCount: number;
  customers: CustomerDto[];
  initialCustomerId: string;
  cpfOnReceipt: string;
  onCpfChange: (value: string) => void;
  isSubmitting: boolean;
  onConfirm: (result: PdvCheckoutResult) => void;
  onClose: () => void;
};

let lineSeq = 0;
function nextLineId(): string {
  lineSeq += 1;
  return `pay-${lineSeq}`;
}

export default function PdvCheckoutModal({
  totalCents,
  itemCount,
  customers,
  initialCustomerId,
  cpfOnReceipt,
  onCpfChange,
  isSubmitting,
  onConfirm,
  onClose,
}: PdvCheckoutModalProps) {
  /** Valores digitados pelo operador. Forma ausente = nunca digitada. */
  const [typed, setTyped] = useState<Record<string, number>>({});
  const [active, setActive] = useState("dinheiro");
  const [discountCents, setDiscountCents] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [onAccount, setOnAccount] = useState(false);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [error, setError] = useState("");

  const activeInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  /* ---------------------------- contas ---------------------------- */

  const dueCents = Math.max(0, totalCents - discountCents);

  /** Soma do que foi digitado nas OUTRAS linhas — a base do saldo da ativa. */
  const typedElsewhere = useMemo(
    () =>
      Object.entries(typed).reduce(
        (sum, [key, cents]) => (key === active ? sum : sum + cents),
        0,
      ),
    [active, typed],
  );

  /** O que a linha ativa sugere: exatamente o que falta para fechar. */
  const balanceCents = Math.max(0, dueCents - typedElsewhere);

  /** Valor de uma linha: o digitado, ou o saldo se ela é a linha ativa. */
  function valueOf(key: string): number {
    const explicit = typed[key];
    if (explicit !== undefined) return explicit;
    return key === active ? balanceCents : 0;
  }

  const cashCents = valueOf("dinheiro");
  const nonCashCents = PDV_PAYMENT_METHODS.filter(
    (method) => method.value !== "dinheiro",
  ).reduce((sum, method) => sum + valueOf(method.value), 0);

  /** Quanto do total sobra para o dinheiro cobrir, depois das outras formas. */
  const dueForCashCents = Math.max(0, dueCents - nonCashCents);
  const appliedCashCents = Math.min(cashCents, dueForCashCents);
  const changeCents = Math.max(0, cashCents - dueForCashCents);
  const missingCents = Math.max(0, dueCents - (nonCashCents + cashCents));
  const overCents = Math.max(0, nonCashCents - dueCents);

  const changeBreakdown = useMemo(
    () => (changeCents > 0 ? suggestChangeBreakdown(changeCents) : []),
    [changeCents],
  );

  /** Cédulas que cobrem o que falta — as menores primeiro, sem virar ruído. */
  const quickBills = useMemo(() => {
    const candidates = [500, 1000, 2000, 5000, 10000, 20000];
    return candidates.filter((bill) => bill >= dueForCashCents).slice(0, 4);
  }, [dueForCashCents]);

  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  /* ------------------------- estado de validade ------------------------- */

  const blockingReason = (() => {
    if (totalCents <= 0) return "Venda vazia.";
    if (discountCents >= totalCents) return "O desconto não pode zerar a venda.";
    if (onAccount && !customerId) return "Identifique o cliente para deixar a venda fiada.";
    if (onAccount) return "";
    if (overCents > 0) return `Passou ${formatCentsBrl(overCents)} do total.`;
    if (missingCents > 0) return `Falta ${formatCentsBrl(missingCents)}.`;
    return "";
  })();

  const canConfirm = blockingReason === "" && !isSubmitting;

  /* ---------------------------- efeitos ---------------------------- */

  /** Trocar de linha seleciona o valor: o próximo dígito substitui, não emenda. */
  useEffect(() => {
    const input = activeInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [active]);

  useEffect(() => {
    if (discountOpen) discountInputRef.current?.focus();
  }, [discountOpen]);

  const methodIndex = PDV_PAYMENT_METHODS.findIndex(
    (method) => method.value === active,
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "F2" || event.key === "Enter") {
        event.preventDefault();
        confirmRef.current?.click();
        return;
      }

      if (event.key === "F3") {
        event.preventDefault();
        setDiscountOpen((current) => !current);
        return;
      }

      if (event.key === "F4") {
        event.preventDefault();
        setOnAccount((current) => !current);
        setExtrasOpen(true);
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next =
          (methodIndex + step + PDV_PAYMENT_METHODS.length) %
          PDV_PAYMENT_METHODS.length;
        setActive(PDV_PAYMENT_METHODS[next].value);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [methodIndex, onClose]);

  /* ---------------------------- comandos ---------------------------- */

  function setActiveValue(cents: number) {
    setTyped((current) => ({ ...current, [active]: cents }));
    setError("");
  }

  function pushDigit(digit: string) {
    setActiveValue(parseTypedCents(`${valueOf(active)}${digit}`));
  }

  function backspace() {
    setActiveValue(Math.floor(valueOf(active) / 10));
  }

  /** Volta a linha ao modo "saldo": some o valor fixo e ela recalcula sozinha. */
  function clearActive() {
    setTyped((current) => {
      const next = { ...current };
      delete next[active];
      return next;
    });
    setError("");
  }

  function handleConfirm() {
    if (!canConfirm) {
      setError(blockingReason);
      return;
    }

    /* Linhas do banco: valor APLICADO, para a soma fechar com o total. */
    const lines: PdvPaymentLine[] = [];
    if (onAccount) {
      lines.push({ id: nextLineId(), type: "fiado", amountCents: dueCents });
    }
    for (const method of onAccount ? [] : PDV_PAYMENT_METHODS) {
      const applied =
        method.value === "dinheiro" ? appliedCashCents : valueOf(method.value);
      if (applied > 0) {
        lines.push({ id: nextLineId(), type: method.value, amountCents: applied });
      }
    }

    onConfirm({
      paymentType: lines.map((line) => line.type).join("+") || "dinheiro",
      paymentLabel:
        lines
          .map((line) => {
            const label =
              PDV_PAYMENT_METHODS.find((method) => method.value === line.type)
                ?.label ?? line.type;
            return `${label} R$ ${formatCents(line.amountCents)}`;
          })
          .join(" + ") || "Dinheiro",
      cashGivenCents: onAccount ? 0 : cashCents,
      changeCents: onAccount ? 0 : changeCents,
      discountCents,
      totalToPayCents: dueCents,
      customerId,
      customerName: selectedCustomer?.customerName ?? "",
      customerDocument: selectedCustomer?.document ?? "",
      lines,
    });
  }

  /* ---------------------------- render ---------------------------- */

  return (
    <div
      className="fixed inset-0 z-layer-dialog grid place-items-center bg-black/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Pagamento"
    >
      <div className="flex max-h-[96vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border-primary bg-bg-light shadow-2xl">
        {/* Total: o maior número da tela, porque é o que o cliente pergunta */}
        <div className="relative shrink-0 px-5 pb-4 pt-5 text-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar pagamento"
            className="absolute right-3.5 top-3.5 grid h-9 w-9 place-items-center rounded-lg text-text-tertiary transition hover:bg-hover-light hover:text-primary"
          >
            <X size={20} />
          </button>

          <p className="text-sm font-semibold text-text-secondary">Total a Pagar</p>
          <p
            className="font-mono text-5xl font-bold leading-tight text-text-primary"
            aria-live="polite"
          >
            {formatCentsBrl(dueCents)}
          </p>

          {discountCents > 0 && (
            <p className="mt-0.5 text-sm text-text-secondary">
              <span className="line-through">{formatCentsBrl(totalCents)}</span>{" "}
              <span className="font-semibold text-success">
                −{formatCentsBrl(discountCents)}
              </span>
            </p>
          )}

          {discountOpen ? (
            <div className="mt-3 flex items-center justify-center gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <Percent size={15} aria-hidden="true" />
                Desconto R$
              </label>
              <input
                ref={discountInputRef}
                type="text"
                inputMode="numeric"
                value={formatCents(discountCents)}
                onChange={(event) =>
                  setDiscountCents(
                    Math.min(
                      Math.max(0, totalCents - 1),
                      parseTypedCents(event.target.value),
                    ),
                  )
                }
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    setDiscountOpen(false);
                    activeInputRef.current?.focus();
                    activeInputRef.current?.select();
                  }
                }}
                className="input-field w-32 text-right font-mono font-bold"
                aria-label="Valor do desconto em reais"
              />
              <button
                type="button"
                onClick={() => {
                  setDiscountCents(0);
                  setDiscountOpen(false);
                }}
                className="rounded-lg border border-border-secondary px-3 py-2 text-sm font-semibold text-text-secondary transition hover:border-primary hover:text-primary"
              >
                Remover
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDiscountOpen(true)}
              className="mt-1 text-xs font-bold uppercase tracking-widest text-text-tertiary transition hover:text-accent"
            >
              F3 Desconto
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Uma linha por forma: clique ou seta escolhe, o valor se digita ali */}
          <ul
            className="border-y border-border-primary"
            aria-label="Formas de pagamento"
          >
            {PDV_PAYMENT_METHODS.map((method) => {
              const isActive = method.value === active;
              const cents = valueOf(method.value);
              const showValue = isActive || cents > 0;

              return (
                <li
                  key={method.value}
                  onClick={() => setActive(method.value)}
                  className={`pdv-pay-row ${isActive ? "pdv-pay-row-active" : ""}`}
                >
                  <span
                    className={`pdv-pay-icon ${method.toneClass}`}
                    aria-hidden="true"
                  >
                    {method.icon}
                  </span>

                  <span className="flex-1 truncate text-lg text-text-primary">
                    {method.label}
                  </span>

                  <input
                    ref={isActive ? activeInputRef : undefined}
                    type="text"
                    inputMode="numeric"
                    value={showValue ? formatCents(cents) : ""}
                    onFocus={() => setActive(method.value)}
                    onChange={(event) => {
                      setActive(method.value);
                      setTyped((current) => ({
                        ...current,
                        [method.value]: parseTypedCents(event.target.value),
                      }));
                      setError("");
                    }}
                    className="pdv-pay-value"
                    aria-label={`Valor em ${method.label}`}
                  />
                </li>
              );
            })}
          </ul>

          {/* Linha viva: só aparece quando há troco a devolver ou valor faltando */}
          {(changeCents > 0 || missingCents > 0 || overCents > 0) && (
            <div className="px-4 pt-3">
              {changeCents > 0 && (
                <div className="flex items-baseline justify-between gap-3 rounded-lg border border-success/40 bg-success/10 px-3.5 py-2">
                  <span className="text-sm font-bold uppercase tracking-wide text-success">
                    Troco
                  </span>
                  <span
                    className="font-mono text-3xl font-bold leading-none text-success"
                    aria-live="polite"
                    aria-label={`Troco ${formatCentsBrl(changeCents)}`}
                  >
                    {formatCentsBrl(changeCents)}
                  </span>
                </div>
              )}

              {(missingCents > 0 || overCents > 0) && (
                <div className="flex items-baseline justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2">
                  <span className="text-sm font-bold uppercase tracking-wide text-primary">
                    {missingCents > 0 ? "Falta" : "Passou"}
                  </span>
                  <span
                    className="font-mono text-3xl font-bold leading-none text-primary"
                    aria-live="polite"
                  >
                    {formatCentsBrl(missingCents > 0 ? missingCents : overCents)}
                  </span>
                </div>
              )}

              {changeBreakdown.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Devolver
                  </span>
                  {changeBreakdown.map((part) => (
                    <span
                      key={part.valueCents}
                      className="rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success"
                    >
                      {part.count}× {formatCentsBrl(part.valueCents)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fiado e o "..." — mesma posição da referência */}
          <div className="flex items-center gap-3 px-4 py-3">
            <label
              className={`flex cursor-pointer items-center gap-2 text-sm font-semibold ${
                onAccount ? "text-primary" : "text-text-secondary"
              }`}
            >
              <input
                type="checkbox"
                checked={onAccount}
                onChange={(event) => {
                  setOnAccount(event.target.checked);
                  setExtrasOpen(true);
                  setError("");
                }}
                className="h-4 w-4"
              />
              Deixar em débito na conta do cliente (F4).
            </label>

            <button
              type="button"
              onClick={() => setExtrasOpen((current) => !current)}
              aria-expanded={extrasOpen}
              aria-label="Mais opções do pagamento"
              className={`ml-auto grid h-9 w-11 shrink-0 place-items-center rounded-lg border transition ${
                extrasOpen
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border-secondary text-text-secondary hover:border-accent hover:text-accent"
              }`}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>

          {extrasOpen && (
            <div className="space-y-3 border-t border-border-primary bg-bg-gray-theme px-4 py-3">
              {/* Atalhos de valor para a linha ativa */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={clearActive}
                  className="rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent transition hover:bg-accent hover:text-white"
                >
                  Valor exato · {formatCentsBrl(balanceCents)}
                </button>
                {active === "dinheiro" &&
                  quickBills.map((bill) => (
                    <button
                      key={bill}
                      type="button"
                      onClick={() => setActiveValue(bill)}
                      className="rounded-lg border border-border-secondary bg-bg-light px-3 py-1.5 text-sm font-semibold text-text-secondary transition hover:border-accent hover:text-accent"
                    >
                      {formatCentsBrl(bill)}
                    </button>
                  ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-text-secondary">
                    Cliente
                  </span>
                  <select
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                    className="select-field w-full"
                  >
                    <option value="">Consumidor não identificado</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.customerName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-text-secondary">
                    CPF/CNPJ no cupom
                  </span>
                  <input
                    type="text"
                    value={cpfOnReceipt}
                    onChange={(event) => onCpfChange(event.target.value)}
                    placeholder="Opcional"
                    className="input-field w-full"
                  />
                </label>
              </div>

              {/* Teclado: tela de toque não tem teclado físico */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-text-secondary">
                  <Calculator size={15} aria-hidden="true" />
                  Digitar em {PDV_PAYMENT_METHODS.find((m) => m.value === active)?.label}
                </p>
                <PdvNumericKeypad
                  onDigit={pushDigit}
                  onBackspace={backspace}
                  onClear={() => setActiveValue(0)}
                  disabled={isSubmitting}
                />
              </div>

              <p className="text-xs text-text-tertiary">
                {itemCount} {itemCount === 1 ? "item" : "itens"} no cupom · os dígitos
                entram da direita para a esquerda (1-2-3-4 vira R$ 12,34).
              </p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="shrink-0 space-y-2 border-t border-border-primary px-4 py-4">
          {error && (
            <p
              className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="pdv-confirm-btn w-full rounded-lg py-4 text-lg font-bold uppercase tracking-wide text-white transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Registrando venda..." : "F2 Concluir"}
          </button>
        </div>
      </div>
    </div>
  );
}
