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
import { withFreshReads } from "@/services/api/squareApi";

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

/**
 * Ordem da busca: 0 = o nome começa com o que foi digitado; 1 = alguma palavra
 * do nome começa com a primeira palavra digitada; 2 = só contém.
 * `query` já vem normalizada.
 */
export function prefixRank(name: string, query: string): number {
  const normalizedName = normalizeSearchText(name);
  if (normalizedName.startsWith(query)) return 0;
  const firstToken = query.split(/\s+/)[0];
  return normalizedName.split(/\s+/).some((word) => word.startsWith(firstToken)) ? 1 : 2;
}

export type PdvProductsFilter = {
  query: string;
  category: string;
  viewMode: PdvProductViewMode;
};

type CatalogItem = Awaited<ReturnType<typeof productService.list>>[number];

function toPdvProducts(items: CatalogItem[]): PdvProduct[] {
  return items.map((item) => ({
    id: item.id,
    name: item.productName,
    code: item.productCode,
    alternateCodes: item.productAlternateCode ? [item.productAlternateCode] : [],
    stock: Number(item.productQnt || 0),
    unitPriceCents: centsFromApi(item.productSalePrice),
    imageUrl: item.productImageUrl || productImagePath(item.productName, item.productCode),
    supplier: item.productSupplier,
  }));
}

/**
 * Acha o produto dono de um código. Quando mais de um casa (cadastro duplicado,
 * ou um código curto que coincide com outro sem os zeros), fica com quem tem o
 * código igualzinho ao bipado e, depois, com quem tem estoque — antes era o
 * primeiro da lista, que podia ser o cadastro antigo zerado.
 */
export function findProductByCode(list: PdvProduct[], code: string): PdvProduct | null {
  const targets = new Set(productCodeKeys(code));
  if (targets.size === 0) return null;
  const compact = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const typed = compact(code);
  let best: PdvProduct | null = null;
  let bestRank = -1;
  for (const product of list) {
    const codes = [product.code, ...(product.alternateCodes ?? [])];
    if (!codes.some((candidate) => productCodeKeys(candidate).some((key) => targets.has(key)))) continue;
    const rank =
      (codes.some((candidate) => compact(candidate) === typed) ? 2 : 0) + (product.stock > 0 ? 1 : 0);
    if (rank > bestRank) {
      best = product;
      bestRank = rank;
    }
  }
  return best;
}

/** O nome do produto e o do catálogo têm pelo menos uma palavra (não só número) em comum. */
function sharesNameWord(productName: string, info: { name: string; brand: string }): boolean {
  const words = (value: string) =>
    new Set(
      normalizeSearchText(value)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3 && !/^\d+$/.test(word)),
    );
  const catalogWords = words(`${info.name} ${info.brand}`);
  return [...words(productName)].some((word) => catalogWords.has(word));
}

export function usePdvProducts() {
  const [products, setProducts] = useState<PdvProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getFavoriteIds());
  const [usageCounts, setUsageCounts] = useState<PdvUsageMap>(() => getUsageCounts());

  /**
   * Troca o catálogo só se algo mudou. Trocar por uma cópia igual fazia a tela
   * refazer a busca do código bipado a cada atualização, repetindo o erro.
   */
  const replaceProducts = useCallback((next: PdvProduct[]) => {
    setProducts((current) =>
      JSON.stringify(current) === JSON.stringify(next) ? current : next,
    );
    return next;
  }, []);

  /** Catálogo direto do servidor, sem a cópia guardada na memória. */
  const fetchFreshProducts = useCallback(
    () => withFreshReads(() => productService.list()).then((items) => replaceProducts(toPdvProducts(items))),
    [replaceProducts],
  );

  /** Só a parte assíncrona: todo setState roda nos callbacks da promise. */
  const fetchProducts = useCallback(
    () =>
      productService
        .list()
        .then((items) => {
          setProducts(toPdvProducts(items));
        })
        .catch((error: unknown) => {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Verifique se o servidor do Hórus está rodando e tente de novo.",
          );
        })
        .finally(() => setIsLoading(false)),
    [],
  );

  /** Recarga pedida pelo operador: mostra o carregando de novo. */
  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    await fetchProducts();
  }, [fetchProducts]);

  // Na montagem o estado inicial já é "carregando", então basta buscar.
  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  /*
   * Catálogo atualizado sozinho: com mais de um computador, preço e estoque
   * ficavam velhos e a venda era recusada ao finalizar. Recarrega em silêncio a
   * cada 30 s e ao voltar para a janela, sem mostrar erro passageiro.
   */
  useEffect(() => {
    let busy = false;
    const refresh = () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      fetchFreshProducts()
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [fetchFreshProducts]);

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

      // Digitou "c": quem começa com C vem primeiro. O sort é estável, então a
      // ordem original se mantém dentro de cada grupo.
      if (normalizedQuery) {
        return [...result].sort(
          (a, b) => prefixRank(a.name, normalizedQuery) - prefixRank(b.name, normalizedQuery),
        );
      }

      return result;
    },
    [favoriteIds, products, usageCounts],
  );

  /** Busca o produto pelo código exato — o caminho do leitor de código de barras. */
  const findByExactCode = useCallback(
    (code: string): PdvProduct | null => findProductByCode(products, code),
    [products],
  );

  const resolveByScannedCode = useCallback(
    async (rawCode: string): Promise<PdvProduct | null> => {
      const exact = findProductByCode(products, rawCode);
      if (exact) return exact;

      /*
       * Não achou na lista que está na memória do caixa. Ela pode ser de até 30 s
       * atrás (ou de antes do cadastro, se o produto foi criado em outro
       * computador), então pergunta ao servidor antes de dizer que o código não
       * existe — e antes de tentar adivinhar por apelido ou pelo nome.
       */
      let catalog = products;
      try {
        catalog = await fetchFreshProducts();
      } catch {
        // Sem rede: segue com o que já tem.
      }
      const fresh = findProductByCode(catalog, rawCode);
      if (fresh) return fresh;

      const lookupCode = barcodeLookupValue(rawCode);
      if (!lookupCode) return null;

      const aliasedId = readBarcodeAliases()[lookupCode];
      const aliased = catalog.find((product) => product.id === aliasedId);
      if (aliased) return aliased;

      const roundedCandidates = catalog.filter((product) =>
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
      const pool = roundedCandidates.length > 0 ? roundedCandidates : catalog;
      const ranked = pool
        .map((product) => ({
          product,
          score: scoreProductIdentity(product.name, catalogInfo),
        }))
        .sort((left, right) => right.score - left.score);
      const best = ranked[0];
      const second = ranked[1];
      if (!best || best.score < 8 || (second && best.score - second.score < 4)) return null;
      // Só o tamanho igual ("400 g") não basta: um código novo de Leite Ninho
      // virava Nescau 400 g para sempre. Tem de bater ao menos uma palavra.
      if (!sharesNameWord(best.product.name, catalogInfo)) return null;

      saveBarcodeAlias(lookupCode, best.product.id);
      return best.product;
    },
    [fetchFreshProducts, products],
  );

  const toggleFavorite = useCallback((productId: string) => {
    setFavoriteIds(toggleFavoriteId(productId));
  }, []);

  const trackUsage = useCallback((productId: string) => {
    setUsageCounts(registerProductUsage(productId));
  }, []);

  const applySale = useCallback((items: Array<{ id: string; quantity: number }>) => {
    const quantities = new Map(items.map((item) => [item.id, item.quantity]));
    setProducts((current) => current.map((product) => ({
      ...product, stock: product.stock - (quantities.get(product.id) ?? 0),
    })));
  }, []);

  return {
    products,
    isLoading,
    loadError,
    reload: load,
    applySale,
    categories,
    filter,
    findByExactCode,
    resolveByScannedCode,
    favoriteIds,
    toggleFavorite,
    trackUsage,
  };
}
