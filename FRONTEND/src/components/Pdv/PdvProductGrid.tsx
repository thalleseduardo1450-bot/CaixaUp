/**
 * Arquivo: src/components/Pdv/PdvProductGrid.tsx
 * Objetivo: listar os produtos disponíveis para lançamento, em grade ou em lista.
 * Entradas esperadas: produtos já filtrados, favoritos e callbacks de clique.
 *
 * DECISÃO DE DESENHO
 * O cartão mostra PREÇO grande e ESTOQUE com cor. São as duas perguntas que o
 * operador responde em voz alta o dia inteiro ("quanto é?", "tem ainda?"), então
 * elas não podem exigir leitura atenta.
 *
 * O modo lista existe para mercearia com muito item parecido, onde a foto não
 * ajuda e o que importa é varrer nomes rápido.
 */
import { PackageX, Plus, Star } from "lucide-react";

import type { PdvDensity, PdvProduct } from "@/types/pdv";
import { formatCentsBrl } from "@/utils/pdvMoney";

type PdvProductGridProps = {
  products: PdvProduct[];
  viewMode: "grade" | "lista";
  density: PdvDensity;
  columns: number;
  favoriteIds: string[];
  /** Ids já lançados no cupom — ganham um selo para o operador não repetir sem querer. */
  idsInCart: string[];
  onSelectProduct: (product: PdvProduct) => void;
  onToggleFavorite: (productId: string) => void;
  /** Rótulo do estado vazio muda conforme o filtro ativo. */
  emptyTitle: string;
  emptyHint: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
};

/** Estoque virou cor: vermelho zerado, âmbar acabando, cinza normal. */
function stockTone(stock: number): { className: string; label: string } {
  if (stock <= 0) {
    return { className: "text-primary", label: "Sem estoque" };
  }
  if (stock <= 5) {
    return { className: "text-[#b45309]", label: `Resta ${stock}` };
  }
  return { className: "text-text-tertiary", label: `${stock} em estoque` };
}

export default function PdvProductGrid({
  products,
  viewMode,
  density,
  columns,
  favoriteIds,
  idsInCart,
  onSelectProduct,
  onToggleFavorite,
  emptyTitle,
  emptyHint,
  emptyActionLabel,
  onEmptyAction,
}: PdvProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <PackageX size={48} className="text-text-tertiary" aria-hidden="true" />
        <p className="font-display text-xl font-bold text-text-primary">{emptyTitle}</p>
        <p className="max-w-md text-sm text-text-secondary">{emptyHint}</p>
        {emptyActionLabel && onEmptyAction ? (
          <button
            type="button"
            onClick={onEmptyAction}
            className="btn-primary mt-2 inline-flex items-center gap-2"
          >
            <Plus size={18} />
            {emptyActionLabel}
          </button>
        ) : null}
      </div>
    );
  }

  /* ------------------------------- LISTA ------------------------------- */
  if (viewMode === "lista") {
    return (
      <ul className="flex-1 overflow-y-auto px-4 pb-4">
        {products.map((product) => {
          const stock = stockTone(product.stock);
          const isFavorite = favoriteIds.includes(product.id);
          const inCart = idsInCart.includes(product.id);

          return (
            <li key={product.id}>
              <div
                className={`group flex items-center gap-3 rounded-lg border-b border-border-primary/70 px-2 transition hover:bg-hover-light ${
                  density === "compacta" ? "py-2" : "py-3"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectProduct(product)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-base font-semibold text-text-primary">
                    {product.name}
                  </p>
                  <p className="font-mono text-xs text-text-tertiary">
                    {product.code}
                    {inCart && (
                      <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 font-sans font-semibold text-accent">
                        no cupom
                      </span>
                    )}
                  </p>
                </button>

                <span className={`pdv-stock-pill shrink-0 text-xs ${stock.className}`}>
                  {stock.label}
                </span>

                <span className="shrink-0 font-mono text-lg font-bold text-text-primary">
                  {formatCentsBrl(product.unitPriceCents)}
                </span>

                <button
                  type="button"
                  onClick={() => onToggleFavorite(product.id)}
                  aria-label={
                    isFavorite
                      ? `Remover ${product.name} dos favoritos`
                      : `Marcar ${product.name} como favorito`
                  }
                  aria-pressed={isFavorite}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-md transition ${
                    isFavorite
                      ? "text-[#d97706]"
                      : "text-text-tertiary hover:text-[#d97706]"
                  }`}
                >
                  <Star size={17} fill={isFavorite ? "currentColor" : "none"} />
                </button>

                <button
                  type="button"
                  onClick={() => onSelectProduct(product)}
                  aria-label={`Lançar ${product.name}`}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-white transition hover:bg-hover-accent"
                >
                  <Plus size={20} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  /* ------------------------------- GRADE ------------------------------- */
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <ul
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {products.map((product) => {
          const stock = stockTone(product.stock);
          const isFavorite = favoriteIds.includes(product.id);
          const inCart = idsInCart.includes(product.id);
          const outOfStock = product.stock <= 0;

          return (
            <li key={product.id} className="relative">
              <button
                type="button"
                onClick={() => onSelectProduct(product)}
                className={`pdv-tile flex h-full w-full flex-col gap-2 rounded-xl border-2 border-accent/35 bg-accent/[0.025] text-left shadow-sm hover:border-accent hover:bg-accent/[0.06] focus-visible:border-accent ${
                  density === "compacta" ? "p-2.5" : "p-3"
                } ${
                  inCart ? "border-accent bg-accent/10" : ""
                } ${outOfStock ? "opacity-70" : ""}`}
              >
                <p
                  className="line-clamp-2 min-h-[2.9rem] text-base font-semibold leading-snug text-text-primary"
                  title={product.name}
                >
                  {product.name}
                </p>

                <p className="font-mono text-xs text-text-tertiary">{product.code}</p>

                <div className="mt-auto flex items-end justify-between gap-2 border-t border-border-primary/60 pt-2">
                  <span className="font-mono text-xl font-bold text-text-primary">
                    {formatCentsBrl(product.unitPriceCents)}
                  </span>
                  <span className={`pdv-stock-pill text-xs ${stock.className}`}>
                    {stock.label}
                  </span>
                </div>
              </button>

              {/* Favorito flutuante: não entra no botão principal para não virar
                  clique acidental de lançamento. */}
              <button
                type="button"
                onClick={() => onToggleFavorite(product.id)}
                aria-label={
                  isFavorite
                    ? `Remover ${product.name} dos favoritos`
                    : `Marcar ${product.name} como favorito`
                }
                aria-pressed={isFavorite}
                className={`absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-md bg-bg-light/90 transition ${
                  isFavorite
                    ? "text-[#d97706]"
                    : "text-text-tertiary hover:text-[#d97706]"
                }`}
              >
                <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
              </button>

              {inCart && (
                <span className="absolute left-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white">
                  no cupom
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
