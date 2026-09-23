/**
 * Arquivo: src/services/api/userService.ts
 * Objetivo: contas de usuário da empresa direto no Supabase (tabela perfis).
 */
import type { AdminUser } from "@/components/Admin/UsersPage";
import type { UserFormState, UserStatus } from "@/components/Admin/UsersPage";
import { supabase, currentCompanyId } from "@/lib/supabase";

export const userService = {
  async list() {
    const empresaId = await currentCompanyId();
    if (!empresaId) return [];

    const { data } = await supabase
      .from("perfis")
      .select("id, nome, email, telefone, cargo, ativo, created_at")
      .eq("empresa_id", empresaId)
      .order("nome");

    return (data ?? []).map((p: any) => ({
      id: p.id,
      name: p.nome ?? "",
      email: p.email ?? "",
      phone: p.telefone ?? "",
      role: p.cargo ?? "operador",
      status: (p.ativo === false ? "inativo" : "ativo") as UserStatus,
      createdAt: p.created_at ?? "",
      mustChangePassword: false,
    })) as AdminUser[];
  },

  async create(_payload: UserFormState) {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");
    throw new Error("Convide usuários pelo painel executivo ou cadastre pelo site.");
  },

  async update(id: string, payload: UserFormState) {
    const { error } = await supabase
      .from("perfis")
      .update({
        nome: payload.name,
        telefone: payload.phone,
        cargo: payload.role ?? "operador",
      })
      .eq("id", id);
    if (error) throw error;
    return payload as unknown as AdminUser;
  },

  async updateStatus(id: string, status: UserStatus) {
    const { error } = await supabase
      .from("perfis")
      .update({ ativo: status === "ativo" })
      .eq("id", id);
    if (error) throw error;
    return { id, status } as unknown as AdminUser;
  },

  async resetPassword(id: string) {
    const { data: perfil } = await supabase
      .from("perfis")
      .select("id, nome, email")
      .eq("id", id)
      .maybeSingle();

    if (!perfil?.email) {
      throw new Error("Usuário sem e-mail cadastrado para redefinição.");
    }

    const { error } = await supabase.auth.resetPasswordForEmail(perfil.email);
    if (error) throw error;

    const maskedEmail = perfil.email.replace(/^(.)(.*)(@.*)$/, "$1***$3");
    return {
      user: {
        id: perfil.id,
        cpf: "",
        name: perfil.nome ?? "",
        email: perfil.email,
        phone: "",
        role: "atendente",
        status: "ativo" as UserStatus,
        createdAt: "",
        lastLoginAt: "",
        mustChangePassword: false,
      } as AdminUser,
      resetToken: undefined,
      maskedEmail,
    };
  },
};
