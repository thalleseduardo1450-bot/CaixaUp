/**
 * Arquivo: src/hooks/Pdv/usePdvShortcuts.ts
 * Objetivo: atalhos de teclado da frente de caixa, para operar a venda sem mouse.
 * Entradas esperadas: os callbacks de cada ação e um sinalizador para desligar quando há modal aberto.
 *
 * REGRAS QUE ESTE HOOK RESPEITA
 *  - Digitando dentro de um campo, setas / + / - / Delete pertencem ao campo,
 *    não ao PDV. Só as teclas de função valem em qualquer lugar.
 *  - Toda tecla tratada leva preventDefault, senão o F3 abre a busca do navegador
 *    e o F7 liga a navegação por cursor no Chrome.
 *  - F12 continua atendido por compatibilidade com quem já usava o caixa, mas o
 *    navegador abre o DevTools nessa tecla e isso NÃO é cancelável. Por isso o
 *    caminho principal para finalizar é F9 (e o botão grande na tela).
 */
import { useEffect, useRef } from "react";

export type PdvShortcutHandlers = {
  /** F1 — abre/fecha a lista de atalhos. */
  onToggleHelp?: () => void;
  /** F2 — foco no campo de busca/leitura de código. */
  onFocusSearch?: () => void;
  /** F3 — foco no campo de cliente. */
  onFocusCustomer?: () => void;
  /** F4 — foco no campo de quantidade. */
  onFocusQuantity?: () => void;
  /** F6 — abre a lista de vendas suspensas. */
  onOpenSuspended?: () => void;
  /** F7 — suspende a venda atual. */
  onSuspendSale?: () => void;
  /** F8 — cancela a venda atual. */
  onCancelSale?: () => void;
  /** F9 e F12 — abre o pagamento. */
  onOpenCheckout?: () => void;
  /** Ctrl+Delete — remove o item selecionado. */
  onRemoveSelected?: () => void;
  /** Setas ↑/↓ fora de campo — anda pela lista do carrinho. */
  onMoveSelection?: (direction: -1 | 1) => void;
  /** + / - fora de campo — ajusta a quantidade do item selecionado. */
  onAdjustSelected?: (delta: 1 | -1) => void;
  /** Esc — fecha o que estiver aberto ou sai do PDV. */
  onEscape?: () => void;
};

export type UsePdvShortcutsOptions = {
  /** Desligue quando um modal estiver aberto: o modal cuida do próprio teclado. */
  enabled: boolean;
  handlers: PdvShortcutHandlers;
};

/** Lista exibida no painel de ajuda (F1). Fica aqui para não divergir do listener. */
export const PDV_SHORTCUT_HINTS: Array<{ keys: string; label: string }> = [
  { keys: "F1", label: "Mostrar atalhos" },
  { keys: "F2", label: "Buscar produto / ler código" },
  { keys: "F3", label: "Informar cliente" },
  { keys: "F4", label: "Quantidade" },
  { keys: "F6", label: "Vendas suspensas" },
  { keys: "F7", label: "Suspender venda" },
  { keys: "F8", label: "Cancelar venda" },
  { keys: "F9", label: "Finalizar e pagar" },
  { keys: "↑ ↓", label: "Selecionar item do cupom" },
  { keys: "+ / −", label: "Aumentar / diminuir quantidade" },
  { keys: "Ctrl + Del", label: "Remover item selecionado" },
  { keys: "Esc", label: "Fechar / sair" },
];

/** True quando o foco está em algo que consome as teclas de edição. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function usePdvShortcuts({ enabled, handlers }: UsePdvShortcutsOptions) {
  /**
   * Os handlers mudam a cada render (closures novas). Guardando em ref, o
   * listener é registrado uma única vez e ainda assim chama a versão atual.
   */
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      const api = handlersRef.current;
      const typing = isTypingTarget(event.target);

      /** Executa o callback e engole a tecla — só se houver callback. */
      const run = (action?: () => void) => {
        if (!action) return false;
        event.preventDefault();
        action();
        return true;
      };

      switch (event.key) {
        case "F1":
          return void run(api.onToggleHelp);
        case "F2":
          return void run(api.onFocusSearch);
        case "F3":
          return void run(api.onFocusCustomer);
        case "F4":
          return void run(api.onFocusQuantity);
        case "F6":
          return void run(api.onOpenSuspended);
        case "F7":
          return void run(api.onSuspendSale);
        case "F8":
          return void run(api.onCancelSale);
        case "F9":
        case "F12":
          return void run(api.onOpenCheckout);
        case "Escape":
          return void run(api.onEscape);
        default:
          break;
      }

      // A partir daqui são teclas comuns: respeitam quem está digitando.
      if (typing) return;

      if (event.key === "Delete" && (event.ctrlKey || event.metaKey)) {
        run(api.onRemoveSelected);
        return;
      }

      if (event.ctrlKey || event.altKey || event.metaKey) return;

      if (event.key === "ArrowUp") {
        if (api.onMoveSelection) {
          event.preventDefault();
          api.onMoveSelection(-1);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        if (api.onMoveSelection) {
          event.preventDefault();
          api.onMoveSelection(1);
        }
        return;
      }

      if (event.key === "+" || event.key === "=") {
        if (api.onAdjustSelected) {
          event.preventDefault();
          api.onAdjustSelected(1);
        }
        return;
      }

      if (event.key === "-") {
        if (api.onAdjustSelected) {
          event.preventDefault();
          api.onAdjustSelected(-1);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
