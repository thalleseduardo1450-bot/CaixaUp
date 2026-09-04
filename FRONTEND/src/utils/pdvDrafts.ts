/**
 * Arquivo: src/utils/pdvDrafts.ts
 * Objetivo: guardar o carrinho em andamento e as vendas suspensas no navegador.
 * Entradas esperadas: itens do carrinho e metadados da venda.
 *
 * POR QUE ISSO EXISTE
 * Duas dores reais de balcão:
 *  1) A luz cai (ou o operador fecha a aba sem querer) no meio de uma venda de
 *     30 itens. Sem rascunho, tudo é passado de novo item por item.
 *  2) O cliente esqueceu a carteira no carro. O operador precisa "pausar" essa
 *     venda, atender os próximos da fila e depois retomar de onde parou.
 *
 * Fica em localStorage porque é informação local da estação, não do servidor:
 * cada terminal tem o seu carrinho em andamento. Nada aqui é fonte de verdade
 * financeira — a venda só existe de fato depois que a API confirma.
 */
import type { PdvCartItem, PdvDraft, PdvSuspendedSale } from "@/types/pdv";
import { getStoredAuthUser } from "@/utils/authStorage";

function scopedKey(key: string) {
  const user = getStoredAuthUser();
  return `${key}:${user?.companyId ?? 'anonymous'}:${user?.id ?? 'anonymous'}`;
}

export const PDV_DRAFT_STORAGE_KEY = "horus-pdv-draft";
export const PDV_SUSPENDED_STORAGE_KEY = "horus-pdv-suspended";

/** Rascunho mais velho que isso é considerado abandonado e descartado. */
/** Trava para o localStorage não crescer sem limite. */
const MAX_SUSPENDED_SALES = 20;

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(scopedKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    // JSON corrompido ou storage bloqueado: limpa e segue sem quebrar a tela.
    try {
      window.localStorage.removeItem(scopedKey(key));
    } catch {
      /* storage indisponível — nada a fazer */
    }
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(scopedKey(key), JSON.stringify(value));
    return true;
  } catch {
    // Modo privado ou cota cheia. O PDV continua funcionando em memória.
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Rascunho da venda em andamento
 * ------------------------------------------------------------------ */

/** Grava o carrinho atual. Chamado com debounce pelo hook do carrinho. */
export function saveDraft(items: PdvCartItem[], customerId: string, requestId?: string, claimToken?: string, options?: { openImmediately?: boolean }): boolean {
  if (items.length === 0) {
    clearDraft();
    return true;
  }
  const draft: PdvDraft = { items, customerId, savedAt: Date.now(), requestId, claimToken, openImmediately: options?.openImmediately };
  return writeJson(PDV_DRAFT_STORAGE_KEY, draft);
}

/** Lê o rascunho, ignorando o que estiver velho ou malformado. */
export function loadDraft(): PdvDraft | null {
  const draft = readJson<PdvDraft>(PDV_DRAFT_STORAGE_KEY);
  if (!draft || !Array.isArray(draft.items) || draft.items.length === 0) return null;
  if (!Number.isFinite(draft.savedAt)) return null;
  return draft;
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(scopedKey(PDV_DRAFT_STORAGE_KEY));
  } catch {
    /* storage indisponível */
  }
}

/* ------------------------------------------------------------------ *
 * Vendas suspensas
 * ------------------------------------------------------------------ */

export function listSuspendedSales(): PdvSuspendedSale[] {
  const list = readJson<PdvSuspendedSale[]>(PDV_SUSPENDED_STORAGE_KEY);
  if (!Array.isArray(list)) return [];
  return list
    .filter((sale) => sale && Array.isArray(sale.items) && sale.items.length > 0)
    .sort((a, b) => b.suspendedAt - a.suspendedAt);
}

/**
 * Suspende a venda atual e devolve a lista atualizada.
 * Retorna `null` se não houver o que suspender.
 */
export function suspendSale(
  sale: Omit<PdvSuspendedSale, "id" | "suspendedAt">,
): PdvSuspendedSale[] | null {
  if (sale.items.length === 0) return null;

  const entry: PdvSuspendedSale = {
    ...sale,
    id: `susp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    suspendedAt: Date.now(),
  };

  const existing = listSuspendedSales();
  if (existing.length >= MAX_SUSPENDED_SALES) return null;
  const next = [entry, ...existing];
  if (!writeJson(PDV_SUSPENDED_STORAGE_KEY, next)) return null;
  return next;
}

/** Remove uma venda suspensa (ao recuperar ou descartar) e devolve a lista nova. */
export function removeSuspendedSale(id: string): PdvSuspendedSale[] {
  const next = listSuspendedSales().filter((sale) => sale.id !== id);
  writeJson(PDV_SUSPENDED_STORAGE_KEY, next);
  return next;
}

export function clearSuspendedSales(): void {
  try {
    window.localStorage.removeItem(scopedKey(PDV_SUSPENDED_STORAGE_KEY));
  } catch {
    /* storage indisponível */
  }
}

/**
 * Rótulo automático para a venda suspensa, no formato "Venda 14:32".
 * O operador pode trocar depois; isso é só para nunca ficar sem identificação.
 */
export function buildSuspendedLabel(date = new Date()): string {
  const time = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Venda ${time}`;
}
