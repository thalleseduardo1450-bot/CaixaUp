/**
 * Arquivo: src/utils/autoLogin.ts
 * Objetivo: manter compatibilidade com o fluxo antigo de caixa dedicado sem
 * colocar credenciais dentro do instalador distribuído.
 *
 * A sessão autenticada do Supabase já fica salva no computador. Embutir e-mail
 * e senha no JavaScript permitiria extraí-los do instalador público, portanto o
 * login automático por senha foi desativado.
 */
import type { AuthenticatedUser } from "@/utils/authStorage";

/** True quando o build foi gerado com credenciais de caixa dedicado. */
export const autoLoginAtivo = false;

/** Zera o contador (usar depois de um login manual bem-sucedido). */
export function reiniciarAutoLogin() {
  return undefined;
}

/**
 * Tenta autenticar sozinho. Nunca lanca: se a API estiver fora ou a senha
 * tiver mudado, devolve null e quem chamou decide (cair na tela de login).
 */
export async function tentarAutoLogin(): Promise<AuthenticatedUser | null> {
  return null;
}
