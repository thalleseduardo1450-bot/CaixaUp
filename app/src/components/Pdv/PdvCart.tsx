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
 *
 * Cada item é um cartão limpo, como no cupom impresso. Os controles de
 * quantidade e remoção aparecem só no item escolhido (setas, clique ou o último
 * bipado), para quem opera por toque.
 */
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, ReceiptText, Wallet, X } from "lucide-react";

import type { PdvCartItem } from "@/types/pdv";
import { formatCents, formatCentsBrl } from "@/utils/pdvMoney";

type PdvCartProps = {
  items: PdvCartItem[];
  totalCents: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onSetQuantity: (id: string, quantity: number) => void;
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

const keyHint = "font-mono font-semibold text-text-secondary";

function EditableQuantity({
  quantity,
  productName,
  onCommit,
}: {
  quantity: number;
  productName: string;
  onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState(String(quantity));
  const [shownQuantity, setShownQuantity] = useState(quantity);

  // A quantidade mudou por fora (leitor, atalho): o campo acompanha no mesmo render.
  if (quantity !== shownQuantity) {
    setShownQuantity(quantity);
    setDraft(String(quantity));
  }

  const commit = () => {
    const next = Number(draft);
    if (!Number.isInteger(next) || next < 1) {
      setDraft(String(quantity));
      return;
    }
    onCommit(next);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 4))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(String(quantity));
          event.currentTarget.blur();
        }
      }}
      className="h-8 w-12 rounded-md border border-transparent bg-transparent text-center font-mono text-base font-bold text-text-primary outline-none transition hover:border-border-secondary hover:bg-bg-light focus:border-accent focus:bg-bg-light"
      aria-label={`Quantidade de ${productName}`}
      title="Clique e digite a quantidade"
    />
  );
}

type PdvCartItemsProps = Pick<
  PdvCartProps,
  "items" | "selectedId" | "onSelect" | "onIncrement" | "onDecrement" | "onSetQuantity" | "onRemove"
>;

/** Itens da venda em cartões, na área grande do caixa. */
export function PdvCartItems({ items, selectedId, onSelect, onIncrement, onDecrement, onSetQuantity, onRemove }: PdvCartItemsProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const unitCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const lastId = items.at(-1)?.id;

  // O item escolhido fica sempre à vista, mesmo num cupom longo.
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>(`[data-cart-item="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId, items.length]);

  return (
          <div className="flex min-h-0 flex-1 flex-col px-5 pt-4">
            <div className="mb-2 flex items-baseline justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-text-secondary">Itens</span>
              <span className="text-text-tertiary">
                {items.length} {items.length === 1 ? "produto" : "produtos"} · {unitCount} un.
              </span>
            </div>

            <ul ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-1">
              {items.map((item, index) => {
                const isSelected = item.id === selectedId;

                return (
                  <li
                    key={item.id}
                    data-cart-item={item.id}
                    onClick={() => onSelect(item.id)}
                    className={`cursor-pointer rounded-xl border px-3.5 py-2.5 transition ${
                      isSelected
                        ? "border-accent/50 bg-accent/10"
                        : "border-border-primary bg-bg-light hover:border-border-secondary"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 font-mono text-xs ${isSelected ? "text-accent" : "text-text-tertiary"}`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-primary">{item.name}</p>
                        <p className="font-mono text-xs text-text-tertiary">
                          {item.quantity} × {formatCentsBrl(item.unitPriceCents)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-text-primary">
                          {formatCents(item.unitPriceCents * item.quantity)}
                        </p>
                        {item.id === lastId && (
                          <p className="text-[11px] font-semibold text-accent">último</p>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-2 flex items-center gap-2 pl-7">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDecrement(item.id);
                          }}
                          aria-label={`Diminuir quantidade de ${item.name}`}
                          className="grid h-8 w-8 place-items-center rounded-md border border-border-secondary bg-bg-light text-text-secondary transition hover:border-accent hover:text-accent"
                        >
                          <Minus size={15} />
                        </button>
                        <EditableQuantity
                          quantity={item.quantity}
                          productName={item.name}
                          onCommit={(quantity) => onSetQuantity(item.id, quantity)}
                        />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onIncrement(item.id);
                          }}
                          aria-label={`Aumentar quantidade de ${item.name}`}
                          className="grid h-8 w-8 place-items-center rounded-md border border-border-secondary bg-bg-light text-text-secondary transition hover:border-accent hover:text-accent"
                        >
                          <Plus size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemove(item.id);
                          }}
                          aria-label={`Remover ${item.name} da venda`}
                          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-text-tertiary transition hover:bg-primary/10 hover:text-primary"
                        >
                          <X size={14} />
                          Remover
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="py-2 text-xs text-text-tertiary">
              Setas selecionam · <kbd className={keyHint}>+</kbd>/<kbd className={keyHint}>−</kbd> qtd. ·{" "}
              <kbd className={keyHint}>Ctrl+Del</kbd> remove
            </p>
          </div>
  );
}

export default function PdvCart({
  items,
  totalCents,
  onCheckout,
  onCancelSale,
  onSuspendSale,
  onOpenSuspended,
  suspendedCount,
  checkoutDisabled,
  isSubmitting,
}: Omit<PdvCartProps, keyof PdvCartItemsProps | "items"> & Pick<PdvCartProps, "items">) {
  const isEmpty = items.length === 0;
  const unitCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-primary bg-bg-light">
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div
            className="grid h-16 w-16 place-items-center rounded-full bg-accent/10 text-accent"
            aria-hidden="true"
          >
            <ReceiptText size={28} />
          </div>
          <p className="mt-1 text-base font-bold text-text-primary">Nenhum produto na venda</p>
          <p className="text-sm text-text-secondary">
            Leia o código de barras ou busque o produto para começar.
          </p>
          <p className="mt-3 text-xs text-text-tertiary">
            Dica: <kbd className={keyHint}>F4</kbd> muda a quantidade antes de bipar
          </p>
        </div>
      ) : (
        <>
          <header className="flex shrink-0 items-center justify-between border-b border-border-primary px-5 py-3">
            <h2 className="text-xl font-bold text-text-primary">Venda</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Em andamento
            </span>
          </header>

          {/* A lista de itens fica na área grande do caixa; aqui só o resumo. */}
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="font-mono text-4xl font-bold text-text-primary">{unitCount}</p>
            <p className="text-sm text-text-secondary">
              {unitCount === 1 ? "unidade" : "unidades"} · {items.length} {items.length === 1 ? "produto" : "produtos"}
            </p>
          </div>
        </>
      )}

      {/* Rodapé fixo: total e ações */}
      <div className="pdv-panel-header shrink-0 space-y-3 border-t border-border-primary bg-bg-primary px-5 py-4">
        <div className="space-y-1 text-sm text-text-secondary">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-mono">{formatCentsBrl(totalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Desconto</span>
            <span className="text-xs text-text-tertiary">no pagamento</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3 border-t border-border-primary pt-3">
          <span className="text-sm font-bold uppercase tracking-wider text-text-primary">Total</span>
          <span
            className="inline-flex items-baseline gap-2 font-mono text-5xl font-bold leading-none text-text-primary"
            aria-live="polite"
            aria-label={`Total da venda ${formatCentsBrl(totalCents)}`}
          >
            <span className="text-2xl font-semibold text-text-tertiary">R$</span>
            <span>{formatCents(totalCents)}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={onCheckout}
          disabled={isEmpty || checkoutDisabled}
          className="btn-success pdv-checkout-btn flex w-full items-center justify-center gap-3 rounded-xl py-4 text-xl font-bold tracking-wide disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Wallet size={24} />
          {isSubmitting ? "Enviando..." : "Finalizar e pagar"}
          <kbd className="rounded bg-black/20 px-1.5 py-0.5 text-xs font-semibold">
            F2
          </kbd>
        </button>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onSuspendSale}
            disabled={isEmpty}
            title="Suspender venda (F7)"
            className="flex flex-col items-center gap-0.5 rounded-lg border border-border-secondary bg-bg-light px-2 py-2 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Suspender
            <span className="text-[11px] font-normal text-text-tertiary">F7</span>
          </button>

          <button
            type="button"
            onClick={onOpenSuspended}
            title="Vendas suspensas (F6)"
            className={`relative flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-xs font-semibold transition hover:border-accent hover:text-accent ${
              suspendedCount > 0
                ? "border-accent/60 bg-accent/10 text-accent shadow-sm"
                : "border-border-secondary bg-bg-light text-text-primary"
            }`}
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
            className="flex flex-col items-center gap-0.5 rounded-lg border border-primary/30 bg-bg-light px-2 py-2 text-xs font-semibold text-primary transition hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
            <span className="text-[11px] font-normal">F8</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
