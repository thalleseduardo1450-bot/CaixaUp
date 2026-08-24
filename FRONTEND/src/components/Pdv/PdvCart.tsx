/**
 * Arquivo: src/components/Pdv/PdvCart.tsx
 * Objetivo: painel do cupom — itens lançados, totais e as ações de fechar a venda.
 * Entradas esperadas: itens em centavos, item selecionado e callbacks de quantidade/remoção.
 *
 * DECISÃO DE DESENHO
 * O TOTAL é o maior número da tela inteira. Ele é lido em voz alta para o cliente
 * dezenas de vezes por hora e conferido de longe; qualquer coisa menor obriga o
 * operador a se aproximar do monitor.
 *
 * A lista rola, mas o rodapé (total + botão de finalizar) fica fixo. Cupom de 40
 * itens não pode empurrar o botão de pagamento para fora da tela.
 */
import { useEffect, useRef } from "react";
import { Minus, Plus, ReceiptText, Trash2, Wallet, X } from "lucide-react";

import type { PdvCartItem } from "@/types/pdv";
import { formatCentsBrl } from "@/utils/pdvMoney";

type PdvCartProps = {
  items: PdvCartItem[];
  totalCents: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
  onCancelSale: () => void;
  onSuspendSale: () => void;
  onOpenSuspended: () => void;
  suspendedCount: number;
  /** Bloqueia finalizar quando o caixa está fechado ou a venda está em envio. */
  checkoutDisabled: boolean;
  isSubmitting: boolean;
};

export default function PdvCart({
  items,
  totalCents,
  selectedId,
  onSelect,
  onIncrement,
  onDecrement,
  onRemove,
  onCheckout,
  onCancelSale,
  onSuspendSale,
  onOpenSuspended,
  suspendedCount,
  checkoutDisabled,
  isSubmitting,
}: PdvCartProps) {
  const listRef = useRef<HTMLUListElement>(null);

  /**
   * Mantém o item selecionado visível quando o operador navega com ↑/↓ ou quando
   * um item novo entra pelo leitor — sem isso o cupom "some" para baixo.
   */
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(
      `[data-cart-item="${selectedId}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [selectedId, items.length]);

  const isEmpty = items.length === 0;

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-primary bg-bg-light">
      {/* Itens */}
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div
            className="pdv-thumb-empty grid h-20 w-20 place-items-center rounded-full text-text-tertiary"
            aria-hidden="true"
          >
            <ReceiptText size={32} />
          </div>
          <p className="mt-1 text-base font-semibold text-text-primary">Venda vazia</p>
          <p className="text-sm text-text-secondary">
            Bipe o código de barras ou pesquise o produto no campo acima.
          </p>
        </div>
      ) : (
        <ul ref={listRef} className="flex-1 overflow-y-auto">
          {items.map((item, index) => {
            const isSelected = item.id === selectedId;
            const lineTotal = item.unitPriceCents * item.quantity;

            return (
              <li
                key={item.id}
                data-cart-item={item.id}
                onClick={() => onSelect(item.id)}
                className={`cursor-pointer border-b border-border-primary px-4 py-2.5 transition ${
                  isSelected
                    ? "pdv-cart-row-selected bg-accent/10"
                    : "hover:bg-hover-light"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 w-6 shrink-0 font-mono text-xs text-text-tertiary">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-text-primary">
                      {item.name}
                    </p>
                    <p className="font-mono text-xs text-text-tertiary">
                      {item.code} · {formatCentsBrl(item.unitPriceCents)} un
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(item.id);
                    }}
                    aria-label={`Remover ${item.name} do cupom`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-tertiary transition hover:bg-primary/10 hover:text-primary"
                  >
                    <X size={17} />
                  </button>
                </div>

                <div className="mt-1.5 flex items-center gap-2 pl-8">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDecrement(item.id);
                      }}
                      aria-label={`Diminuir quantidade de ${item.name}`}
                      className="grid h-9 w-9 place-items-center rounded-md border border-border-secondary bg-bg-light text-text-secondary transition hover:border-accent hover:text-accent"
                    >
                      <Minus size={16} />
                    </button>
                    <span
                      className="w-11 text-center font-mono text-lg font-bold text-text-primary"
                      aria-label={`Quantidade ${item.quantity}`}
                    >
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onIncrement(item.id);
                      }}
                      aria-label={`Aumentar quantidade de ${item.name}`}
                      className="grid h-9 w-9 place-items-center rounded-md border border-border-secondary bg-bg-light text-text-secondary transition hover:border-accent hover:text-accent"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  <span className="ml-auto font-mono text-lg font-bold text-text-primary">
                    {formatCentsBrl(lineTotal)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Rodapé fixo: total e ações */}
      <div className="pdv-panel-header shrink-0 space-y-3 border-t border-border-primary px-4 py-3">
        <div className="pdv-total-block flex items-baseline justify-between gap-3 px-3.5 py-2.5">
          <span className="text-sm font-bold uppercase tracking-wide text-text-secondary">
            Total
          </span>
          <span
            className="font-mono text-4xl font-bold leading-none text-text-primary"
            aria-live="polite"
            aria-label={`Total da venda ${formatCentsBrl(totalCents)}`}
          >
            {formatCentsBrl(totalCents)}
          </span>
        </div>

        <button
          type="button"
          onClick={onCheckout}
          disabled={isEmpty || checkoutDisabled}
          className="btn-success pdv-checkout-btn flex w-full items-center justify-center gap-2.5 py-4 text-xl disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Wallet size={24} />
          {isSubmitting ? "Enviando..." : "Finalizar e pagar"}
          <kbd className="rounded bg-black/20 px-1.5 py-0.5 text-xs font-semibold">
            F9
          </kbd>
        </button>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onSuspendSale}
            disabled={isEmpty}
            title="Suspender venda (F7)"
            className="flex flex-col items-center gap-0.5 rounded-lg border border-border-secondary bg-bg-light px-2 py-2 text-xs font-semibold text-text-secondary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Suspender
            <span className="text-[11px] font-normal text-text-tertiary">F7</span>
          </button>

          <button
            type="button"
            onClick={onOpenSuspended}
            title="Vendas suspensas (F6)"
            className="relative flex flex-col items-center gap-0.5 rounded-lg border border-border-secondary bg-bg-light px-2 py-2 text-xs font-semibold text-text-secondary transition hover:border-accent hover:text-accent"
          >
            Retomar
            <span className="text-[11px] font-normal text-text-tertiary">F6</span>
            {suspendedCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">
                {suspendedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onCancelSale}
            disabled={isEmpty}
            title="Cancelar venda (F8)"
            className="flex flex-col items-center gap-0.5 rounded-lg border border-border-secondary bg-bg-light px-2 py-2 text-xs font-semibold text-text-secondary transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-1">
              <Trash2 size={13} />
              Cancelar
            </span>
            <span className="text-[11px] font-normal text-text-tertiary">F8</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
