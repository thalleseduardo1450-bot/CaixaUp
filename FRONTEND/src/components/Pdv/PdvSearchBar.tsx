/**
 * Campo principal do caixa para leitura de código ou pesquisa por nome.
 * O catálogo só aparece enquanto existe uma pesquisa, reduzindo distrações.
 */
import { forwardRef } from "react";
import { Barcode, Search, X } from "lucide-react";

type PdvSearchBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  quantity: string;
  onQuantityChange: (value: string) => void;
  resultCount: number;
  quantityRef?: React.Ref<HTMLInputElement>;
};

const PdvSearchBar = forwardRef<HTMLInputElement, PdvSearchBarProps>(
  function PdvSearchBar(
    {
      query,
      onQueryChange,
      onSubmit,
      quantity,
      onQuantityChange,
      resultCount,
      quantityRef,
    },
    searchRef,
  ) {
    const isSearching = query.trim().length > 0;

    return (
      <div className="pdv-panel-header shrink-0 border-b border-border-primary bg-accent/[0.035] px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
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

          <label className="flex min-w-[260px] flex-1 flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-accent">
              <Search size={14} aria-hidden="true" />
              Pesquisar produto — bipe o código ou digite o nome (F2)
            </span>
            <div className="pdv-search-highlight relative rounded-xl bg-bg-light">
              <Barcode
                size={23}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-accent"
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
                placeholder="Clique aqui e pesquise pelo nome ou código"
                autoComplete="off"
                spellCheck={false}
                className="input-field min-h-14 w-full border-transparent bg-transparent pl-13 pr-28 text-lg font-semibold"
                aria-label="Buscar produto por código ou nome"
              />
              {isSearching ? (
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                  <span className="rounded-md bg-accent/10 px-2 py-1 text-xs font-bold text-accent">
                    {resultCount} {resultCount === 1 ? "resultado" : "resultados"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onQueryChange("")}
                    aria-label="Limpar busca"
                    className="grid h-8 w-8 place-items-center rounded-md text-text-tertiary transition hover:bg-hover-light hover:text-primary"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : null}
            </div>
          </label>
        </div>
      </div>
    );
  },
);

export default PdvSearchBar;
