/**
 * Arquivo: src/hooks/Pdv/usePdvProducts.ts
 * Objetivo: carregar, manter atualizado e pesquisar o catálogo da frente de caixa.
 * Entradas esperadas: nenhuma; o hook fala direto com productService.
 *
 * POR QUE O PRODUTO "SUMIA" NA BUSCA (e o que cuida de cada causa)
 *  - A lista vinha cortada em 1000 produtos pelo Supabase: productService.list
 *    agora lê em páginas até vir tudo.
 *  - A lista era lida uma vez só, ao abrir o caixa: produto cadastrado depois
 *    não aparecia. Agora ela se atualiza quando o cadastro avisa (mesmo em
 *    outra janela), quando a janela volta ao foco e a cada poucos minutos.
 *  - Se mesmo assim a busca local não achar nada, searchRemote pergunta ao
 *    servidor antes de o caixa dizer "nenhum produto encontrado".
 *  - A tela mostrava os 80 primeiros em ordem alfabética: a busca agora põe o
 *    que mais se parece com o digitado primeiro (utils/pdvProductSearch).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  PRODUCTS_CHANGED_CHANNEL,
  productService,
  type ProductDto,
} from "@/services/api/productService";
import type { PdvProduct } from "@/types/pdv";
import { centsFromApi } from "@/utils/pdvMoney";
import { productCodeKeys } from "@/utils/productCode";
import {
  buildSearchEntry,
  normalizeSearchText,
  searchCatalog,
  sortCatalog,
  type PdvSearchResult,
} from "@/utils/pdvProductSearch";
import {
  getFavoriteIds,
  getUsageCounts,
  registerProductUsage,
  toggleFavoriteId,
  type PdvUsageMap,
} from "@/utils/pdvViewPreferences";

export { normalizeSearchText };

/** Lista com mais de 1 minuto é relida quando a janela do caixa volta ao foco. */
const STALE_AFTER_MS = 60_000;
/** Releitura de fundo, para pegar o que foi cadastrado em outro computador. */
const BACKGROUND_REFRESH_MS = 5 * 60_000;
/** Importação do Nex salva produto por produto: espera a rajada de avisos acabar. */
const CHANGE_NOTICE_DELAY_MS = 1500;
/** A mesma pergunta ao servidor não se repete dentro deste intervalo. */
const REMOTE_CACHE_MS = 30_000;

function toPdvProduct(item: ProductDto): PdvProduct {
  return {
    id: item.id,
    name: item.productName,
    code: item.productCode,
    alternateCodes: item.productAlternateCode ? [item.productAlternateCode] : [],
    stock: Number(item.productQnt || 0),
    unitPriceCents: centsFromApi(item.productSalePrice),
    imageUrl: item.productImageUrl || undefined,
    supplier: item.productSupplier,
  };
}

export function usePdvProducts() {
  const [products, setProducts] = useState<PdvProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [usageCounts, setUsageCounts] = useState<PdvUsageMap>({});
  /** Texto que está sendo procurado no servidor agora (para a tela avisar). */
  const [remoteSearching, setRemoteSearching] = useState<string | null>(null);

  const loadSeq = useRef(0);
  const lastLoadedAt = useRef(0);
  const remoteInFlight = useRef(new Map<string, Promise<PdvProduct[]>>());
  const remoteDoneAt = useRef(new Map<string, number>());

  const load = useCallback(async () => {
    // Duas leituras ao mesmo tempo (fim da venda + botão "Atualizar"): só a
    // mais nova vale, para uma resposta atrasada não trocar a lista por outra velha.
    const seq = ++loadSeq.current;
    setIsLoading(true);
    setLoadError("");
    try {
      const items = await productService.list();
      if (seq !== loadSeq.current) return;
      setProducts(sortCatalog(items.map(toPdvProduct)));
      lastLoadedAt.current = Date.now();
      remoteDoneAt.current.clear();
    } catch (error) {
      if (seq !== loadSeq.current) return;
      // A lista anterior continua na tela: falhar ao atualizar não pode
      // deixar o caixa sem produto nenhum.
      setLoadError(
        error instanceof Error
          ? error.message
          : "Verifique a internet e tente de novo.",
      );
    } finally {
      if (seq === loadSeq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    setFavoriteIds(getFavoriteIds());
    setUsageCounts(getUsageCounts());
  }, [load]);

  /* ---------------- manter a lista em dia enquanto o caixa fica aberto ---------------- */

  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastLoadedAt.current < STALE_AFTER_MS) return;
      void load();
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load();
    }, BACKGROUND_REFRESH_MS);

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);

    let noticeTimer: number | undefined;
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(PRODUCTS_CHANGED_CHANNEL);
        channel.onmessage = () => {
          window.clearTimeout(noticeTimer);
          noticeTimer = window.setTimeout(() => void load(), CHANGE_NOTICE_DELAY_MS);
        };
      } catch {
        channel = null;
      }
    }

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(noticeTimer);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
      channel?.close();
    };
  }, [load]);

  /* ---------------- busca ---------------- */

  const entries = useMemo(() => products.map(buildSearchEntry), [products]);

  /** Código (e variações sem zero à esquerda) → produto, para o leitor de código. */
  const productsByCode = useMemo(() => {
    const map = new Map<string, PdvProduct>();
    for (const entry of entries) {
      for (const key of entry.codeKeys) {
        if (!map.has(key)) map.set(key, entry.product);
      }
    }
    return map;
  }, [entries]);

  /** Fornecedor virou "categoria": é o único agrupamento que o cadastro tem hoje. */
  const categories = useMemo(() => {
    const found = new Set<string>();
    for (const product of products) {
      const supplier = product.supplier?.trim();
      if (supplier) found.add(supplier);
    }
    return Array.from(found).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const search = useCallback(
    (query: string, limit: number): PdvSearchResult => searchCatalog(entries, query, limit),
    [entries],
  );

  /** Busca o produto pelo código exato — o caminho do leitor de código de barras. */
  const findByExactCode = useCallback(
    (code: string): PdvProduct | null => {
      for (const key of productCodeKeys(code)) {
        const found = productsByCode.get(key);
        if (found) return found;
      }
      return null;
    },
    [productsByCode],
  );

  /**
   * Pergunta ao servidor e junta o que vier à lista da tela. Devolve os
   * produtos achados. Erro de rede vira lista vazia: quem chama já trata o
   * "não achei".
   */
  const searchRemote = useCallback(async (term: string): Promise<PdvProduct[]> => {
    const key = normalizeSearchText(term);
    if (!key) return [];

    const pending = remoteInFlight.current.get(key);
    if (pending) return pending;

    const doneAt = remoteDoneAt.current.get(key);
    if (doneAt && Date.now() - doneAt < REMOTE_CACHE_MS) return [];

    const request = (async () => {
      setRemoteSearching(term);
      try {
        const found = (await productService.search(term)).map(toPdvProduct);
        if (found.length > 0) {
          setProducts((current) => {
            const byId = new Map(current.map((product) => [product.id, product]));
            for (const product of found) byId.set(product.id, product);
            return sortCatalog([...byId.values()]);
          });
        }
        return found;
      } catch {
        return [];
      } finally {
        remoteDoneAt.current.set(key, Date.now());
        remoteInFlight.current.delete(key);
        setRemoteSearching((current) => (current === term ? null : current));
      }
    })();

    remoteInFlight.current.set(key, request);
    return request;
  }, []);

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
    search,
    searchRemote,
    remoteSearching,
    findByExactCode,
    favoriteIds,
    usageCounts,
    toggleFavorite,
    trackUsage,
  };
}
