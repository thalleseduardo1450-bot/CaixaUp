/**
 * Arquivo: src/services/api/authService.ts
 * Objetivo: autenticação via Supabase Auth (login, cadastro, recuperação).
 * O perfil (nome/telefone/empresa) vive na tabela `perfis`, criado por trigger
 * quando o usuário se cadastra. Mantém o contrato dos DTOs usados pelas telas.
 */
import { supabase } from "@/lib/supabase";
import type { AuthenticatedUser } from "@/utils/authStorage";
import type { User } from "@supabase/supabase-js";

const AUTH_CALLBACK_URL = "https://thalleseduardo1450-bot.github.io/CaixaUp/auth/";

export type LoginPayload = {
  email: string;
  password: string;
  rememberMe: boolean;
  recaptchaToken?: string;
};

export type LoginResponse = {
  tokenType: "Bearer";
  expiresInSeconds: number;
  sessionId: string;
  user: AuthenticatedUser;
};

export type RegisterPayload = {
  cnpj: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  recaptchaToken?: string;
};

export type ForgotPasswordResponse = {
  accepted: boolean;
  maskedEmail?: string;
  resetToken?: string;
  expiresAt?: string;
};

export type RegisterResponse = {
  user: AuthenticatedUser | null;
  requiresEmailConfirmation: boolean;
};

type ProfileRow = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  empresa_id: string | null;
  cargo: string;
  ativo: boolean;
  created_at: string;
};

function throwSchemaError(error: { code?: string; message?: string } | null) {
  if (error?.code === "PGRST205" || error?.message?.includes("public.perfis")) {
    throw new Error("O banco do Supabase ainda não foi configurado. Aplique a migração do CaixaUp.");
  }
  if (error) throw error;
}

function throwAuthError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  const message = error.message?.toLowerCase() ?? "";
  if (message.includes("invalid login credentials")) {
    throw new Error("E-mail ou senha incorretos.");
  }
  if (message.includes("email not confirmed")) {
    throw new Error("Confirme seu e-mail antes de entrar.");
  }
  if (message.includes("user already registered")) {
    throw new Error("Este e-mail já possui cadastro.");
  }
  if (message.includes("rate limit")) {
    throw new Error("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }
  if (message.includes("password should be")) {
    throw new Error("A senha deve ter pelo menos 8 caracteres.");
  }
  throw error;
}

async function readProfile(userId: string) {
  const { data, error } = await supabase
    .from("perfis")
    .select("id, nome, email, telefone, empresa_id, cargo, ativo, created_at")
    .eq("id", userId)
    .maybeSingle();
  throwSchemaError(error);
  return data as ProfileRow | null;
}

async function ensureUserProvisioned(user: User) {
  let profile = await readProfile(user.id);
  if (!profile) {
    const { error } = await supabase.from("perfis").upsert({
      id: user.id,
      nome: String(user.user_metadata?.nome || user.email?.split("@")[0] || "Usuário"),
      email: user.email || "",
      telefone: String(user.user_metadata?.telefone || ""),
      cargo: "proprietario",
    });
    throwSchemaError(error);
    profile = await readProfile(user.id);
  }

  if (!profile) throw new Error("Não foi possível criar o perfil deste usuário.");
  if (profile.empresa_id) return profile;

  const companyName = String(user.user_metadata?.nome || "Minha Empresa");
  const { error: provisionError } = await supabase.rpc(
    "provisionar_empresa_usuario",
    {
      p_nome: companyName,
      p_documento: String(user.user_metadata?.cnpj || ""),
      p_telefone: String(user.user_metadata?.telefone || ""),
      p_email: user.email || "",
    },
  );
  throwSchemaError(provisionError);

  const provisionedProfile = await readProfile(user.id);
  if (!provisionedProfile) throw new Error("Não foi possível finalizar o cadastro.");
  return provisionedProfile;
}

/** Busca o perfil + empresa do usuário e monta o AuthenticatedUser das telas. */
async function buildAuthenticatedUser(user: User | null | undefined): Promise<AuthenticatedUser | null> {
  if (!user) return null;
  const perfil = await ensureUserProvisioned(user);

  return {
    id: perfil.id,
    companyId: perfil.empresa_id ?? "",
    cpf: "",
    name: perfil.nome ?? "",
    email: perfil.email ?? "",
    phone: perfil.telefone ?? "",
    role: perfil.cargo ?? "operador",
    status: perfil.ativo === false ? "inativo" : "ativo",
    createdAt: perfil.created_at ?? "",
    lastLoginAt: "",
    mustChangePassword: false,
  };
}

export const authService = {
  async login(payload: LoginPayload) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });
    throwAuthError(error);

    const user = await buildAuthenticatedUser(data.user);
    if (!user) throw new Error("Perfil não encontrado para este usuário.");

    const response: LoginResponse = {
      tokenType: "Bearer",
      expiresInSeconds: 3600 * 24,
      sessionId: data.session?.access_token ?? "",
      user,
    };
    return response;
  },

  async me() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return buildAuthenticatedUser(user);
  },

  async updateMe(payload: { name: string; email: string; phone: string }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada. Faça login novamente.");

    const { error } = await supabase
      .from("perfis")
      .update({ nome: payload.name, telefone: payload.phone })
      .eq("id", user.id);
    throwAuthError(error);

    return buildAuthenticatedUser(user);
  },

  async logout() {
    await supabase.auth.signOut();
  },

  async changePassword(currentPassword: string, nextPassword: string) {
    // Revalida a senha atual antes de trocar
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) throw new Error("Sessão expirada.");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) throw new Error("Senha atual incorreta.");

    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    throwAuthError(error);
  },

  async forgotPassword(_cnpj: string, email: string, _recaptchaToken?: string) {
    const redirectUrl = new URL(AUTH_CALLBACK_URL);
    redirectUrl.searchParams.set("recovery", "1");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl.toString(),
    });
    throwAuthError(error);
    const response: ForgotPasswordResponse = { accepted: true, maskedEmail: email };
    return response;
  },

  async resetPassword(_token: string, nextPassword: string, _confirmPassword: string, _recaptchaToken?: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw new Error("Link de recuperação inválido ou expirado. Solicite um novo e-mail.");
    }
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    throwAuthError(error);
    await supabase.auth.signOut();
  },

  async register(payload: RegisterPayload) {
    if (payload.password !== payload.confirmPassword) {
      throw new Error("A confirmação da senha não confere.");
    }
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: { nome: payload.name, telefone: payload.phone, cnpj: payload.cnpj },
        emailRedirectTo: `${AUTH_CALLBACK_URL}?confirmed=1`,
      },
    });
    throwAuthError(error);

    const requiresEmailConfirmation = data.session == null;
    const built = data.session ? await buildAuthenticatedUser(data.user) : null;
    const response: RegisterResponse = { user: built, requiresEmailConfirmation };
    return response;
  },
};
