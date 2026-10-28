/**
 * Cliente Supabase único do CaixaUp (frente de caixa).
 * Só usa a chave PUBLISHABLE (pública) — a proteção real é o RLS do banco.
 * As variáveis vêm de .env (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Faltam VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY no .env do frontend.",
  );
}

const SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const sessionStorage = {
  getItem(key: string) {
    const created = Number(window.localStorage.getItem(`${key}.created`));
    if (!created || Date.now() - created >= SESSION_AGE_MS || created > Date.now()) {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(`${key}.created`);
      return null;
    }
    return window.localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (!window.localStorage.getItem(key) || !window.localStorage.getItem(`${key}.created`)) {
      window.localStorage.setItem(`${key}.created`, String(Date.now()));
    }
    window.localStorage.setItem(key, value);
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}.created`);
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    detectSessionInUrl: true,
    flowType: "implicit",
    persistSession: true,
    storage: sessionStorage,
    autoRefreshToken: true,
  },
});

/**
 * id da empresa do usuário logado, lido do perfil (tabela perfis).
 * Se não houver perfil/empresa, devolve null.
 */
export async function currentCompanyId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil, error } = await supabase
    .from("perfis")
    .select("empresa_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (perfil as { empresa_id?: string | null } | null)?.empresa_id ?? null;
}
