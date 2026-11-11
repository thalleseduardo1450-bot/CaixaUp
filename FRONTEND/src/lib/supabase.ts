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
 * id do usuário logado, lido da sessão salva neste computador.
 * Antes usava getUser(), que vai ao servidor de login a cada chamada: cada
 * tela pagava uma ida e volta extra só para saber quem é. O banco confere o
 * token de novo em toda consulta (RLS), então a sessão local basta.
 */
export async function currentUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// A empresa do usuário quase nunca muda: guarda por usuário e só lê o perfil
// de novo quando outro usuário entra ou quando o usuário sai.
let empresaCache: { userId: string; empresaId: Promise<string | null> } | null = null;

supabase.auth.onAuthStateChange((event, session) => {
  const userId = session?.user?.id ?? null;
  if (event === "SIGNED_OUT" || !userId || (empresaCache && empresaCache.userId !== userId)) {
    empresaCache = null;
  }
});

/** Esquece a empresa guardada (por exemplo, logo depois de criar a empresa). */
export function clearCompanyCache() {
  empresaCache = null;
}

/**
 * id da empresa do usuário logado, lido do perfil (tabela perfis).
 * Se não houver perfil/empresa, devolve null.
 */
export async function currentCompanyId(): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  if (empresaCache?.userId === userId) return empresaCache.empresaId;

  const pedido = (async () => {
    const { data: perfil, error } = await supabase
      .from("perfis")
      .select("empresa_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return (perfil as { empresa_id?: string | null } | null)?.empresa_id ?? null;
  })();
  empresaCache = { userId, empresaId: pedido };
  // Erro ou usuário ainda sem empresa: não guarda, tenta de novo na próxima.
  pedido.then(
    (empresaId) => {
      if (!empresaId && empresaCache?.empresaId === pedido) empresaCache = null;
    },
    () => {
      if (empresaCache?.empresaId === pedido) empresaCache = null;
    },
  );
  return pedido;
}
