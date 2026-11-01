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
import { useEffect, useRef, useState } from "react";
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
  summaryOnly?: boolean;
};

type PdvCartItemsProps = Pick<
  PdvCartProps,
  "items" | "selectedId" | "onSelect" | "onIncrement" | "onDecrement" | "onRemove"
> & {
  wide?: boolean;
  /** Quando existe, o número da quantidade vira campo: clica, digita e Enter. */
  onSetQuantity?: (id: string, quantity: number) => void;
};

/**
 * Quantidade do item que aceita digitação. Clicar seleciona o número, então
 * digitar 6 troca o 1 por 6 (não vira 16). Enter ou sair do campo confirma;
 * Esc desiste. Vazio ou zero não apaga o item: volta ao valor anterior (para
 * remover existe o X).
 */
function CartQuantityInput({
  quantity,
  itemName,
  onCommit,
}: {
  quantity: number;
  itemName: string;
  onCommit: (quantity: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const editing = text !== null;

  function finish(save: boolean) {
    if (save && text !== null) {
      const parsed = Number(text);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed !== quantity) {
        onCommit(Math.floor(parsed));
      }
    }
    setText(null);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={editing ? text : String(quantity)}
      onClick={(event) => event.stopPropagation()}
      onFocus={(event) => {
        setText(String(quantity));
        event.currentTarget.select();
      }}
      onMouseUp={(event) => event.preventDefault()}
      onChange={(event) => setText(event.target.value.replace(/\D/g, "").slice(0, 4))}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setText(null);
          event.currentTarget.blur();
        }
      }}
      className="h-9 w-14 rounded-md border border-border-secondary bg-bg-light text-center font-mono text-lg font-bold text-text-primary outline-none transition hover:border-accent focus:border-accent focus:ring-2 focus:ring-accent/30"
      aria-label={`Quantidade de ${itemName}`}
      title="Clique e digite a quantidade"
    />
  );
}

export function PdvCartItems({
  items,
  selectedId,
  onSelect,
  onIncrement,
  onDecrement,
  onRemove,
  wide = false,
  onSetQuantity,
}: PdvCartItemsProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>(`[data-cart-item="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId, items.length]);

  return (
    <ul ref={listRef} className="flex-1 overflow-y-auto">
      {items.map((item, index) => {
        const isSelected = item.id === selectedId;
        const lineTotal = item.unitPriceCents * item.quantity;

        return (
          <li
            key={item.id}
            data-cart-item={item.id}
            onClick={() => onSelect(item.id)}
            className={`pdv-cart-row-in cursor-pointer border-b border-border-primary px-4 py-2.5 transition ${
              isSelected ? "pdv-cart-row-selected bg-accent/10" : "hover:bg-hover-light"
            } ${wide ? "sm:flex sm:items-center sm:gap-4" : ""}`}
          >
            <div className={`flex min-w-0 items-start gap-2 ${wide ? "sm:flex-1" : ""}`}>
              <span className="mt-0.5 w-6 shrink-0 font-mono text-xs text-text-tertiary">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-text-primary">{item.name}</p>
                <p className="font-mono text-xs text-text-tertiary">
                  {item.code} · {formatCentsBrl(item.unitPriceCents)} un
                </p>
              </div>
            </div>

            <div className={`mt-1.5 flex items-center gap-2 pl-8 ${wide ? "sm:mt-0 sm:pl-0" : ""}`}>
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
              {onSetQuantity ? (
                <CartQuantityInput
                  quantity={item.quantity}
                  itemName={item.name}
                  onCommit={(quantity) => onSetQuantity(item.id, quantity)}
                />
              ) : (
                <span className="w-11 text-center font-mono text-lg font-bold text-text-primary">
                  {item.quantity}
                </span>
              )}
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
              <span className="min-w-28 text-right font-mono text-lg font-bold text-text-primary">
                {formatCentsBrl(lineTotal)}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(item.id);
                }}
                aria-label={`Remover ${item.name} da venda`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-tertiary transition hover:bg-primary/10 hover:text-primary"
              >
                <X size={17} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

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
  summaryOnly = false,
}: PdvCartProps) {
  const isEmpty = items.length === 0;
  const totalText = formatCentsBrl(totalCents);

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-primary bg-bg-light">
      {/* Itens */}
      {summaryOnly ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 border-b border-border-primary px-6 text-center">
          <ReceiptText size={36} className="text-accent" aria-hidden="true" />
          <p className="text-xl font-bold text-text-primary">Venda</p>
          <p className="text-sm text-text-secondary">
            {items.length} {items.length === 1 ? "produto" : "produtos"}
          </p>
        </div>
      ) : isEmpty ? (
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
        <PdvCartItems
          items={items}
          selectedId={selectedId}
          onSelect={onSelect}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          onRemove={onRemove}
        />
      )}

      {/* Rodapé fixo: total e ações */}
      <div className="shrink-0 border-t border-border-primary">
        {/*
          O TOTAL segue a coluna Venda de ponta a ponta, em qualquer resolução.
          Valor grande (R$ 100.000,00 para cima) diminui a letra em vez de
          sair da coluna.
        */}
        <div className="pdv-total-block flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-wide text-text-secondary">
            Total
          </span>
          <span
            key={totalCents}
            className={`pdv-total-bump ml-auto whitespace-nowrap font-mono font-bold leading-none text-text-primary ${
              totalText.length > 12 ? "text-3xl" : "text-4xl"
            }`}
            aria-live="polite"
            aria-label={`Total da venda ${totalText}`}
          >
            {totalText}
          </span>
        </div>

        <div className="pdv-panel-header space-y-3 px-4 py-3">
          <button
            type="button"
            onClick={onCheckout}
            disabled={isEmpty || checkoutDisabled}
            className="btn-success pdv-checkout-btn flex w-full items-center justify-center gap-2.5 py-4 text-xl disabled:cursor-not-allowed disabled:opacity-60"
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
      </div>
    </aside>
  );
}
