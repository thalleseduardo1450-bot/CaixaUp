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

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    detectSessionInUrl: true,
    flowType: "implicit",
    persistSession: true,
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

  const { data: perfil } = await supabase
    .from("perfis")
    .select("empresa_id")
    .eq("id", user.id)
    .maybeSingle();
  return (perfil as { empresa_id?: string | null } | null)?.empresa_id ?? null;
}
