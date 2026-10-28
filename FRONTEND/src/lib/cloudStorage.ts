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

function enqueue(key: string, value: string | null) {
  const userId = owner;
  if (!userId) return;
  pending = pending.then(async () => {
    const result = value === null
      ? await supabase.from('preferencias_usuario').delete().eq('usuario_id', userId).eq('chave', key)
      : await supabase.from('preferencias_usuario').upsert({ usuario_id: userId, chave: key, valor: value });
    if (result.error) throw result.error;
  }).catch((error: unknown) => {
    failure = new Error(error instanceof Error ? error.message : 'Falha ao salvar no Supabase.');
    window.dispatchEvent(new CustomEvent('caixaup-persistence-error', { detail: failure.message }));
  });
}

export async function flushCloudStorage() {
  await pending;
  if (failure) { const error = failure; failure = null; throw error; }
}

export function resetCloudStorage() { owner = null; values.clear(); }

export const cloudStorage = {
  getItem(key: string): string | null { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, value); enqueue(key, value); },
  removeItem(key: string) { values.delete(key); enqueue(key, null); },
};
