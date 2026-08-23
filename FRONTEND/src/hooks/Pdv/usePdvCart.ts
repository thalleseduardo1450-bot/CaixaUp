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
import {
  buildSuspendedLabel,
  clearDraft,
  listSuspendedSales,
  loadDraft,
  removeSuspendedSale,
  saveDraft,
  suspendSale,
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
    if (draft && draft.items.length > 0) {
      setRecoverableItems(draft.items);
    } else {
      draftReadyRef.current = true;
    }
    setSuspended(listSuspendedSales());
  }, []);

  /* ---------------- gravação automática do rascunho ---------------- */

  useEffect(() => {
    if (!draftReadyRef.current) return;
    const timer = window.setTimeout(() => saveDraft(items, ""), DRAFT_DEBOUNCE_MS);
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
  }, []);

  /* ---------------- vendas suspensas ---------------- */

  const suspendCurrent = useCallback(
    (meta: { customerId: string; customerName: string; label?: string }) => {
      if (itemsRef.current.length === 0) return false;
      const next = suspendSale({
        label: meta.label?.trim() || buildSuspendedLabel(),
        items: itemsRef.current,
        customerId: meta.customerId,
        customerName: meta.customerName,
        operatorName,
        totalCents,
      });
      if (!next) return false;
      setSuspended(next);
      commit([]);
      setLastTouchedId(null);
      clearDraft();
      return true;
    },
    [commit, operatorName, totalCents],
  );

  /**
   * Traz a venda suspensa de volta ao carrinho. Se já houver itens lançados,
   * eles são suspensos antes — o operador nunca perde o que estava passando.
   */
  const resumeSuspended = useCallback(
    (id: string, meta: { customerId: string; customerName: string }) => {
      const target = listSuspendedSales().find((sale) => sale.id === id);
      if (!target) return null;

      if (itemsRef.current.length > 0) {
        const parked = suspendSale({
          label: buildSuspendedLabel(),
          items: itemsRef.current,
          customerId: meta.customerId,
          customerName: meta.customerName,
          operatorName,
          totalCents,
        });
        if (parked) setSuspended(parked);
      }

      setSuspended(removeSuspendedSale(id));
      commit(target.items);
      setLastTouchedId(null);
      return target;
    },
    [commit, operatorName, totalCents],
  );

  const discardSuspended = useCallback((id: string) => {
    setSuspended(removeSuspendedSale(id));
  }, []);

  return {
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
