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
import { productImagePath } from "@/utils/productImage";
import type { PdvProduct, PdvProductViewMode } from "@/types/pdv";
import { centsFromApi } from "@/utils/pdvMoney";
import {
  barcodeLookupValue,
  lookupBarcodeCatalog,
  productCodeKeys,
  roundedBarcodePrefix,
  scoreProductIdentity,
} from "@/utils/productCode";
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
const BARCODE_ALIASES_KEY = "caixaup.barcode.aliases.v1";

function readBarcodeAliases(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(BARCODE_ALIASES_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveBarcodeAlias(code: string, productId: string) {
  const aliases = readBarcodeAliases();
  aliases[code] = productId;
  window.localStorage.setItem(BARCODE_ALIASES_KEY, JSON.stringify(aliases));
}

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
          alternateCodes: item.productAlternateCode
            ? [item.productAlternateCode]
            : [],
          stock: Number(item.productQnt || 0),
          unitPriceCents: centsFromApi(item.productSalePrice),
          imageUrl: item.productImageUrl || productImagePath(item.productName, item.productCode),
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
        const queryCodeKeys = new Set(productCodeKeys(query));
        result = result.filter((product) => {
          const productCodes = [product.code, ...(product.alternateCodes ?? [])];
          if (
            productCodes.some((code) =>
              productCodeKeys(code).some((key) => queryCodeKeys.has(key)),
            )
          ) {
            return true;
          }
          const haystack = normalizeSearchText(
            `${product.name} ${productCodes.join(" ")} ${product.supplier ?? ""}`,
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
      const targets = new Set(productCodeKeys(code));
      if (targets.size === 0) return null;
      return (
        products.find((product) =>
          [product.code, ...(product.alternateCodes ?? [])].some((candidate) =>
            productCodeKeys(candidate).some((key) => targets.has(key)),
          ),
        ) ?? null
      );
    },
    [products],
  );

  const resolveByScannedCode = useCallback(
    async (rawCode: string): Promise<PdvProduct | null> => {
      const exact = findByExactCode(rawCode);
      if (exact) return exact;

      const lookupCode = barcodeLookupValue(rawCode);
      if (!lookupCode) return null;

      const aliasedId = readBarcodeAliases()[lookupCode];
      const aliased = products.find((product) => product.id === aliasedId);
      if (aliased) return aliased;

      const roundedCandidates = products.filter((product) =>
        [product.code, ...(product.alternateCodes ?? [])].some((candidate) => {
          const prefix = roundedBarcodePrefix(candidate);
          return prefix ? lookupCode.startsWith(prefix) : false;
        }),
      );

      if (roundedCandidates.length === 1) {
        saveBarcodeAlias(lookupCode, roundedCandidates[0].id);
        return roundedCandidates[0];
      }

      const catalogInfo = await lookupBarcodeCatalog(lookupCode);
      if (!catalogInfo) return null;
      const pool = roundedCandidates.length > 0 ? roundedCandidates : products;
      const ranked = pool
        .map((product) => ({
          product,
          score: scoreProductIdentity(product.name, catalogInfo),
        }))
        .sort((left, right) => right.score - left.score);
      const best = ranked[0];
      const second = ranked[1];
      if (!best || best.score < 8 || (second && best.score - second.score < 4)) return null;

      saveBarcodeAlias(lookupCode, best.product.id);
      return best.product;
    },
    [findByExactCode, products],
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
    resolveByScannedCode,
    favoriteIds,
    toggleFavorite,
    trackUsage,
  };
}
