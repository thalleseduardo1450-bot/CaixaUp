import { supabase } from './supabase';

// Synchronous view of state loaded from PostgreSQL before the PDV is mounted.
// No browser or filesystem persistence is used.
let owner: string | null = null;
const values = new Map<string, string>();
let pending: Promise<void> = Promise.resolve();
let failure: Error | null = null;

export async function hydrateCloudStorage(userId: string) {
  if (owner === userId) return;
  await flushCloudStorage();
  const { data, error } = await supabase.from('preferencias_usuario').select('chave, valor').eq('usuario_id', userId);
  if (error) throw error;
  values.clear();
  for (const row of data ?? []) values.set(row.chave, row.valor);
  owner = userId;
}

// Gravações que ainda não foram ao banco, por chave. Se a mesma chave muda
// várias vezes antes de sair (carrinho, página atual), só o último valor vai.
const queued = new Map<string, { userId: string; value: string | null }>();
let draining = false;

function enqueue(key: string, value: string | null) {
  const userId = owner;
  if (!userId) return;
  queued.set(key, { userId, value });
  if (draining) return;
  draining = true;
  pending = pending.then(async () => {
    try {
      while (queued.size > 0) {
        const [nextKey, next] = queued.entries().next().value as [string, { userId: string; value: string | null }];
        queued.delete(nextKey);
        const result = next.value === null
          ? await supabase.from('preferencias_usuario').delete().eq('usuario_id', next.userId).eq('chave', nextKey)
          : await supabase.from('preferencias_usuario').upsert({ usuario_id: next.userId, chave: nextKey, valor: next.value });
        if (result.error) throw result.error;
      }
    } finally {
      draining = false;
    }
  }).catch((error: unknown) => {
    failure = new Error(error instanceof Error ? error.message : 'Falha ao salvar no Supabase.');
    window.dispatchEvent(new CustomEvent('caixaup-persistence-error', { detail: failure.message }));
  });
}

export async function flushCloudStorage() {
  await pending;
  if (failure) { const error = failure; failure = null; throw error; }
}

export function resetCloudStorage() { owner = null; values.clear(); queued.clear(); }

export const cloudStorage = {
  getItem(key: string): string | null { return values.get(key) ?? null; },
  // Valor igual ao que já está salvo não vai ao banco de novo.
  setItem(key: string, value: string) {
    if (values.get(key) === value && !queued.has(key)) return;
    values.set(key, value);
    enqueue(key, value);
  },
  removeItem(key: string) {
    if (!values.has(key) && !queued.has(key)) return;
    values.delete(key);
    enqueue(key, null);
  },
};
