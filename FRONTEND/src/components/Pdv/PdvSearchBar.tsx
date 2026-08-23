/**
 * Arquivo: src/components/Pdv/PdvSearchBar.tsx
 * Objetivo: campo único de leitura/busca de produto com quantidade e filtros de exibição.
 * Entradas esperadas: texto digitado, quantidade, modo de exibição e callbacks de mudança.
 *
 * DECISÃO DE DESENHO
 * Um campo só, não dois. O operador de caixa não decide "isto é um código ou um
 * nome?" — ele bipa ou digita, e a tela resolve. Código de barras completo entra
 * direto no carrinho; qualquer outra coisa filtra a lista abaixo.
 *
 * A quantidade fica ANTES do campo de busca porque o fluxo é "3 unidades disto":
 * digita 3, tabula, bipa. Assim o campo de busca continua sendo o último foco e
 * fica pronto para a próxima leitura.
 *
 * A grade de produtos permanece visível para facilitar a seleção por toque e
 * deixar os filtros sempre disponíveis ao operador.
 */
import { forwardRef } from "react";
import { Barcode, CornerDownLeft, Star, TrendingUp, X } from "lucide-react";

import type { PdvProductViewMode } from "@/types/pdv";

type PdvSearchBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  /** Enter no campo: tenta lançar a leitura exata ou o único resultado. */
  onSubmit: () => void;
  quantity: string;
  onQuantityChange: (value: string) => void;
  viewMode: PdvProductViewMode;
  onViewModeChange: (mode: PdvProductViewMode) => void;
  /** Categorias/fornecedores encontrados nos produtos carregados. */
  categories: string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  resultCount: number;
  quantityRef?: React.Ref<HTMLInputElement>;
};

const VIEW_MODE_TABS: Array<{
  key: PdvProductViewMode;
  label: string;
  icon?: React.ReactNode;
}> = [
  { key: "grade", label: "Grade" },
  { key: "lista", label: "Lista" },
  { key: "favoritos", label: "Favoritos", icon: <Star size={15} /> },
  { key: "mais-vendidos", label: "Mais usados", icon: <TrendingUp size={15} /> },
];

const PdvSearchBar = forwardRef<HTMLInputElement, PdvSearchBarProps>(
  function PdvSearchBar(
    {
      query,
      onQueryChange,
      onSubmit,
      quantity,
      onQuantityChange,
      viewMode,
      onViewModeChange,
      categories,
      activeCategory,
      onCategoryChange,
      resultCount,
      quantityRef,
    },
    searchRef,
  ) {
    return (
      <div className="pdv-panel-header shrink-0 space-y-3 border-b border-border-primary px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Quantidade */}
          <label className="flex w-24 shrink-0 flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Qtd (F4)
            </span>
            <input
              ref={quantityRef}
              type="text"
              inputMode="numeric"
              value={quantity}
              onChange={(event) =>
                onQuantityChange(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              onFocus={(event) => event.currentTarget.select()}
              className="input-field w-full text-center font-mono text-xl font-bold"
              aria-label="Quantidade a lançar"
            />
          </label>

          {/* Busca / leitura */}
          <label className="flex min-w-[240px] flex-1 flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Produto — bipe o código ou digite o nome (F2)
            </span>
            <div className="relative">
              <Barcode
                size={22}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary"
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder="Ex.: 7891000315507 ou Leite integral"
                autoComplete="off"
                spellCheck={false}
                className="input-field w-full pl-12 pr-11 text-lg"
                aria-label="Buscar produto por código ou nome"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-text-tertiary transition hover:bg-hover-light hover:text-primary"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </label>

          {/*
            "Lançar" só existe enquanto há algo digitado — sem texto ele não teria
            o que lançar, e um botão morto ao lado da lupa só confunde.
          */}
          {query.length > 0 && (
            <button
              type="button"
              onClick={onSubmit}
              className="flex h-12 shrink-0 items-center gap-2 rounded-lg border border-border-secondary px-4 font-semibold text-text-secondary transition hover:border-accent hover:text-accent"
            >
              <CornerDownLeft size={18} />
              Lançar
            </button>
          )}

        </div>

        {/* Abas de exibição + categorias */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div
              className="flex items-center gap-1 rounded-lg border border-border-primary bg-bg-gray-theme p-1"
              role="tablist"
              aria-label="Modo de exibição dos produtos"
            >
              {VIEW_MODE_TABS.map((tab) => {
                const isActive = viewMode === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onViewModeChange(tab.key)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                      isActive
                        ? "bg-bg-light text-accent shadow-sm"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {categories.length > 0 && (
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onCategoryChange("")}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    activeCategory === ""
                      ? "border-accent bg-accent text-white"
                      : "border-border-secondary bg-bg-light text-text-secondary hover:border-accent hover:text-accent"
                  }`}
                >
                  Todos
                </button>
                {categories.map((category) => {
                  const isActive = activeCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => onCategoryChange(isActive ? "" : category)}
                      className={`max-w-[180px] truncate rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        isActive
                          ? "border-accent bg-accent text-white"
                          : "border-border-secondary bg-bg-light text-text-secondary hover:border-accent hover:text-accent"
                      }`}
                      title={category}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            )}

            <span className="ml-auto shrink-0 text-xs text-text-tertiary" aria-live="polite">
              {resultCount} {resultCount === 1 ? "produto" : "produtos"}
            </span>
        </div>
      </div>
    );
  },
);

export default PdvSearchBar;
