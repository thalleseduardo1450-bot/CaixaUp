/**
 * Arquivo: src/hooks/Pdv/usePdvCart.ts
 * Objetivo: concentrar toda a regra do carrinho da frente de caixa em um só lugar.
 * Entradas esperadas: produtos já normalizados (preço em centavos) e a política de estoque vigente.
 *
 * O que este hook resolve, além de somar itens:
 *  - Total sempre exato, porque soma inteiro de centavos (nunca float).
 *  - Rascunho automático: se a energia cair, o carrinho volta.
 *  - Vendas suspensas: guardar um carrinho, atender outro cliente e retomar.
 *  - Bloqueio de estoque com mensagem pronta para o operador.
 *
 * DETALHE IMPORTANTE DE IMPLEMENTAÇÃO
 * O carrinho vive em um ref (`itemsRef`) e o state é só o espelho para renderizar.
 * Motivo: leitor de código de barras dispara vários lançamentos no mesmo tick, e
 * o updater do useState não roda na hora — duas leituras rápidas do mesmo produto
 * calculariam estoque em cima do carrinho velho. Com o ref, cada comando lê o
 * carrinho já atualizado pelo comando anterior.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PdvCartItem, PdvProduct, PdvSuspendedSale } from "@/types/pdv";
import { suspendedSalesService } from "@/services/api/suspendedSalesService";
import {
  buildSuspendedLabel,
  clearDraft,
  loadDraft,
  saveDraft,
} from "@/utils/pdvDrafts";

/** Quantidade máxima por linha — trava contra o scanner "travado" repetindo leitura. */
const MAX_QUANTITY_PER_ITEM = 9999;
/** Espera antes de gravar o rascunho, para não escrever no disco a cada tecla. */
const DRAFT_DEBOUNCE_MS = 400;

export type PdvAddOutcome =
  | { ok: true; item: PdvCartItem; merged: boolean }
  | { ok: false; reason: "sem-estoque" | "limite-quantidade"; message: string };

export type UsePdvCartOptions = {
  /** Quando true, estoque insuficiente só avisa; não bloqueia o lançamento. */
  allowSellingWithoutStock: boolean;
  /** Nome do operador logado, gravado junto da venda suspensa. */
  operatorName: string;
};

export function usePdvCart({
  allowSellingWithoutStock,
  operatorName,
}: UsePdvCartOptions) {
  const itemsRef = useRef<PdvCartItem[]>([]);
  const requestIdRef = useRef<string>(crypto.randomUUID());
  const claimTokenRef = useRef<string | undefined>(undefined);
  const operationRef = useRef(false);
  const customerRef = useRef("");
  const [items, setItemsState] = useState<PdvCartItem[]>([]);
  const [lastTouchedId, setLastTouchedId] = useState<string | null>(null);
  const [suspended, setSuspended] = useState<PdvSuspendedSale[]>([]);
  const [recoverableItems, setRecoverableItems] = useState<PdvCartItem[] | null>(null);

  /**
   * Só passa a gravar rascunho depois que a recuperação foi decidida. Sem isso,
   * o carrinho vazio do primeiro render sobrescreveria o rascunho que queremos
   * oferecer ao operador.
   */
  const draftReadyRef = useRef(false);

  /** Único caminho de escrita do carrinho: mantém ref e state sempre iguais. */
  const commit = useCallback((next: PdvCartItem[]) => {
    itemsRef.current = next;
    setItemsState(next);
  }, []);

  /* ---------------- carga inicial: rascunho + suspensas ---------------- */

  useEffect(() => {
    const draft = loadDraft();
    if (draft?.requestId) requestIdRef.current = draft.requestId;
    claimTokenRef.current = draft?.claimToken;
    customerRef.current = draft?.customerId ?? "";
    if (draft && draft.items.length > 0) {
      setRecoverableItems(draft.items);
    } else {
      draftReadyRef.current = true;
    }
    void suspendedSalesService.list().then(setSuspended).catch(() => {});
  }, []);

  /* ---------------- gravação automática do rascunho ---------------- */

  useEffect(() => {
    if (!draftReadyRef.current) return;
    const timer = window.setTimeout(() => saveDraft(items, customerRef.current, requestIdRef.current, claimTokenRef.current), DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [items]);

  /* ---------------- totais ---------------- */

  const totalCents = useMemo(
    () => items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0),
    [items],
  );

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  /* ---------------- comandos ---------------- */

  const addProduct = useCallback(
    (product: PdvProduct, quantity = 1): PdvAddOutcome => {
      const requested = Math.max(1, Math.floor(quantity));
      const current = itemsRef.current;
      const existingIndex = current.findIndex((item) => item.id === product.id);
      const alreadyInCart = existingIndex >= 0 ? current[existingIndex].quantity : 0;
      const desired = alreadyInCart + requested;

      if (desired > MAX_QUANTITY_PER_ITEM) {
        return {
          ok: false,
          reason: "limite-quantidade",
          message: `Quantidade máxima de ${MAX_QUANTITY_PER_ITEM} unidades por item.`,
        };
      }

      if (!allowSellingWithoutStock && desired > product.stock) {
        return {
          ok: false,
          reason: "sem-estoque",
          message:
            product.stock <= 0
              ? `${product.name} está sem estoque.`
              : `Só há ${product.stock} unidade(s) de ${product.name} em estoque.`,
        };
      }

      if (existingIndex >= 0) {
        const next = [...current];
        const updated: PdvCartItem = { ...next[existingIndex], quantity: desired };
        next[existingIndex] = updated;
        commit(next);
        setLastTouchedId(product.id);
        return { ok: true, item: updated, merged: true };
      }

      const item: PdvCartItem = {
        id: product.id,
        code: product.code,
        name: product.name,
        quantity: requested,
        unitPriceCents: product.unitPriceCents,
        imageUrl: product.imageUrl,
        addedAt: Date.now(),
      };
      commit([...current, item]);
      setLastTouchedId(product.id);
      return { ok: true, item, merged: false };
    },
    [allowSellingWithoutStock, commit],
  );

  const setQuantity = useCallback(
    (id: string, quantity: number) => {
      const safe = Math.floor(quantity);
      if (safe <= 0) {
        commit(itemsRef.current.filter((item) => item.id !== id));
        setLastTouchedId(null);
        return;
      }
      commit(
        itemsRef.current.map((item) =>
          item.id === id
            ? { ...item, quantity: Math.min(MAX_QUANTITY_PER_ITEM, safe) }
            : item,
        ),
      );
      setLastTouchedId(id);
    },
    [commit],
  );

  const increment = useCallback(
    (id: string, step = 1) => {
      const target = itemsRef.current.find((item) => item.id === id);
      if (!target) return;
      setQuantity(id, target.quantity + step);
    },
    [setQuantity],
  );

  const decrement = useCallback(
    (id: string, step = 1) => {
      const target = itemsRef.current.find((item) => item.id === id);
      if (!target) return;
      setQuantity(id, target.quantity - step);
    },
    [setQuantity],
  );

  const removeItem = useCallback(
    (id: string) => {
      commit(itemsRef.current.filter((item) => item.id !== id));
      setLastTouchedId(null);
    },
    [commit],
  );

  const clear = useCallback(() => {
    requestIdRef.current = crypto.randomUUID();
    claimTokenRef.current = undefined;
    customerRef.current = "";
    commit([]);
    setLastTouchedId(null);
    clearDraft();
  }, [commit]);

  /* ---------------- recuperação do rascunho ---------------- */

  const acceptRecovery = useCallback(() => {
    commit(recoverableItems ?? []);
    setRecoverableItems(null);
    draftReadyRef.current = true;
  }, [commit, recoverableItems]);

  const dismissRecovery = useCallback(() => {
    setRecoverableItems(null);
    draftReadyRef.current = true;
    clearDraft();
    requestIdRef.current = crypto.randomUUID();
    claimTokenRef.current = undefined;
  }, []);

  /* ---------------- vendas suspensas ---------------- */

  const suspendCurrent = useCallback(
    async (meta: { customerId: string; customerName: string; label?: string }) => {
      if (itemsRef.current.length === 0) return false;
      if (operationRef.current) return false;
      operationRef.current = true;
      try {
        await suspendedSalesService.suspend(itemsRef.current, {
          label: meta.label?.trim() || buildSuspendedLabel(),
          customerId: meta.customerId,
          customerName: meta.customerName,
          operatorName,
        });
        clear();
        void suspendedSalesService.list().then(setSuspended).catch(() => {});
        return true;
      } finally { operationRef.current = false; }
    },
    [clear, operatorName],
  );

  /**
   * Traz a venda suspensa de volta ao carrinho. Se já houver itens lançados,
   * eles são suspensos antes — o operador nunca perde o que estava passando.
   */
  const resumeSuspended = useCallback(
    async (id: string, meta: { customerId: string; customerName: string }) => {
      if (itemsRef.current.length > 0) {
        throw new Error("Suspenda a venda atual antes de retomar outra.");
      }
      if (operationRef.current) return null;
      operationRef.current = true;
      let target: PdvSuspendedSale;
      try { target = await suspendedSalesService.resume(id); }
      finally { operationRef.current = false; }
      requestIdRef.current = target.id;
      claimTokenRef.current = target.claimToken;
      customerRef.current = target.customerId || meta.customerId;
      saveDraft(target.items, customerRef.current, target.id, target.claimToken);
      setSuspended((current) => current.filter((sale) => sale.id !== id));
      commit(target.items);
      setLastTouchedId(null);
      return target;
    },
    [commit],
  );

  const discardSuspended = useCallback(async (id: string) => {
    await suspendedSalesService.discard(id);
    setSuspended((current) => current.filter((sale) => sale.id !== id));
  }, []);

  return {
    requestId: requestIdRef.current,
    claimToken: claimTokenRef.current,
    refreshSuspended: async () => setSuspended(await suspendedSalesService.list()),
    persist: (customerId: string) => {
      customerRef.current = customerId;
      return saveDraft(itemsRef.current, customerId, requestIdRef.current, claimTokenRef.current);
    },
    items,
    totalCents,
    itemCount,
    lineCount: items.length,
    lastTouchedId,
    isEmpty: items.length === 0,

    addProduct,
    setQuantity,
    increment,
    decrement,
    removeItem,
    clear,

    recoverableItems,
    acceptRecovery,
    dismissRecovery,

    suspended,
    suspendCurrent,
    resumeSuspended,
    discardSuspended,
  };
}

export type PdvCartApi = ReturnType<typeof usePdvCart>;
