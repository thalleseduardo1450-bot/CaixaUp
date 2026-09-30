/**
 * Arquivo: src/services/api/subscriptionService.ts
 * Objetivo: plano da empresa e troca de plano pela administração.
 *
 * O plano pago liberado pelo administrador fica na API (Square Cloud). Empresa
 * sem plano pago lá continua com o do Supabase (teste grátis e pagamentos
 * antigos): quando a API responde 404, a consulta vai ao Supabase.
 */
import { supabase } from "@/lib/supabase";
import { squareApi } from "@/services/api/squareApi";

export type AdminSubscriptionRow = {
  companyId: string;
  companyName: string;
  email: string;
  plan: "pro" | "premium" | null;
  paidUntil: string | null;
};

export const subscriptionService = {
  async mine(signal?: AbortSignal): Promise<unknown> {
    try {
      return await squareApi<unknown>("/subscription");
    } catch (error) {
      if ((error as { status?: number })?.status !== 404) throw error;
    }
    const request = supabase.rpc("minha_assinatura");
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    if (error) throw error;
    return data;
  },

  listForAdmin(search: string) {
    return squareApi<AdminSubscriptionRow[]>(`/admin/subscriptions?search=${encodeURIComponent(search.trim())}`, { method: "GET" });
  },

  change(payload: { email: string; plan: "gratis" | "pro" | "premium"; months: number; reason: string }) {
    return squareApi<AdminSubscriptionRow>("/admin/subscriptions", { method: "POST", body: JSON.stringify(payload) });
  },
};
