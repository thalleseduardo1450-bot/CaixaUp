/**
 * Arquivo: src/hooks/Pdv/usePdvProducts.ts
 * Objetivo: carregar, normalizar e filtrar o catálogo usado pela frente de caixa.
 * Entradas esperadas: nenhuma; o hook fala direto com productService.
 *
 * Por que a filtragem mora aqui e não na página: são três regras que precisam
 * andar juntas (texto, categoria e modo de exibição) e uma delas é sutil —
 * a busca ignora acento. Sem isso, quem digita "cafe" não encontra "Café", e o
 * operador conclui que o produto não está cadastrado.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { productService } from "@/services/api/productService";
import type { PdvProduct, PdvProductViewMode } from "@/types/pdv";
import { centsFromApi } from "@/utils/pdvMoney";
import {
  getFavoriteIds,
  getUsageCounts,
  registerProductUsage,
  toggleFavoriteId,
  type PdvUsageMap,
} from "@/utils/pdvViewPreferences";

/**
 * Bloco de acentos combinantes (U+0300–U+036F) que o NFD separa da letra base.
 * Montado via RegExp com escape em vez de literal: acento solto no código-fonte
 * é ilegível na revisão e desaparece em qualquer editor que renormalize o arquivo.
 */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Minúscula e sem acento, para "cafe" achar "Café" e "AÇÚCAR" achar "acucar". */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

export type PdvProductsFilter = {
  query: string;
  category: string;
  viewMode: PdvProductViewMode;
};

export function usePdvProducts() {
  const [products, setProducts] = useState<PdvProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [usageCounts, setUsageCounts] = useState<PdvUsageMap>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const items = await productService.list();
      setProducts(
        items.map((item) => ({
          id: item.id,
          name: item.productName,
          code: item.productCode,
          stock: Number(item.productQnt || 0),
          unitPriceCents: centsFromApi(item.productSalePrice),
          imageUrl: item.productImageUrl,
          supplier: item.productSupplier,
        })),
      );
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Verifique se o servidor do Hórus está rodando e tente de novo.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    setFavoriteIds(getFavoriteIds());
    setUsageCounts(getUsageCounts());
  }, [load]);

  /** Fornecedor virou "categoria": é o único agrupamento que o cadastro tem hoje. */
  const categories = useMemo(() => {
    const found = new Set<string>();
    for (const product of products) {
      const supplier = product.supplier?.trim();
      if (supplier) found.add(supplier);
    }
    return Array.from(found).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const filter = useCallback(
    ({ query, category, viewMode }: PdvProductsFilter): PdvProduct[] => {
      const normalizedQuery = normalizeSearchText(query);

      let result = products;

      if (category) {
        result = result.filter((product) => product.supplier?.trim() === category);
      }

      if (viewMode === "favoritos") {
        result = result.filter((product) => favoriteIds.includes(product.id));
      }

      if (normalizedQuery) {
        result = result.filter((product) => {
          const haystack = normalizeSearchText(
            `${product.name} ${product.code} ${product.supplier ?? ""}`,
          );
          // Cada palavra digitada tem de aparecer: "leite int" acha "Leite Integral".
          return normalizedQuery
            .split(/\s+/)
            .every((token) => haystack.includes(token));
        });
      }

      if (viewMode === "mais-vendidos") {
        return [...result]
          .filter((product) => (usageCounts[product.id] ?? 0) > 0)
          .sort((a, b) => (usageCounts[b.id] ?? 0) - (usageCounts[a.id] ?? 0));
      }

      return result;
    },
    [favoriteIds, products, usageCounts],
  );

  /** Busca o produto pelo código exato — o caminho do leitor de código de barras. */
  const findByExactCode = useCallback(
    (code: string): PdvProduct | null => {
      const target = normalizeSearchText(code);
      if (!target) return null;
      return (
        products.find((product) => normalizeSearchText(product.code) === target) ?? null
      );
    },
    [products],
  );

  const toggleFavorite = useCallback((productId: string) => {
    setFavoriteIds(toggleFavoriteId(productId));
  }, []);

  const trackUsage = useCallback((productId: string) => {
    setUsageCounts(registerProductUsage(productId));
  }, []);

  return {
    products,
    isLoading,
    loadError,
    reload: load,
    categories,
    filter,
    findByExactCode,
    favoriteIds,
    toggleFavorite,
    trackUsage,
  };
}
