/**
 * Arquivo: src/services/api/cashRegisterService.ts
 * Objetivo: abertura, fechamento e status de caixa direto no Supabase.
 * Tabelas: sessoes_caixa + movimentacoes_caixa + caixas.
 */
import { supabase, currentCompanyId } from "@/lib/supabase";

export type CashRegisterSessionDto = {
  id: string;
  status: string;
  openedAt: string;
  closedAt?: string | null;
  openingAmount: string;
  closingAmount: string;
  operatorName: string;
  closedByName: string;
  note: string;
  elapsedMinutes: number;
};

export type CashRegisterStatusDto = {
  state: "aberto" | "fechado" | "expirado" | string;
  canSell: boolean;
  blockReason: string;
  serverNow: string;
  currentSession?: CashRegisterSessionDto | null;
  lastSession?: CashRegisterSessionDto | null;
  history: CashRegisterSessionDto[];
};

function reaisToText(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0,00";
  return num.toFixed(2).replace(".", ",");
}

function parseReais(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  const num = Number(String(value ?? "0").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(num) ? num : 0;
}

function toSession(row: any): CashRegisterSessionDto {
  const openedAt = row.data_abertura ?? "";
  const elapsed = openedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000))
    : 0;
  return {
    id: row.id,
    status: row.status === "aberto" ? "aberto" : row.status === "fechado" ? "fechado" : row.status,
    openedAt,
    closedAt: row.data_fechamento ?? null,
    openingAmount: reaisToText(row.valor_inicial),
    closingAmount: reaisToText(row.valor_informado ?? row.valor_esperado),
    operatorName: row.perfis?.nome ?? "",
    closedByName: "",
    note: row.observacao ?? "",
    elapsedMinutes: elapsed,
  };
}

export const cashRegisterService = {
  async status() {
    const empresaId = await currentCompanyId();
    if (!empresaId) {
      const empty: CashRegisterStatusDto = {
        state: "fechado",
        canSell: false,
        blockReason: "Nenhuma empresa vinculada ao seu usuário.",
        serverNow: new Date().toISOString(),
        currentSession: null,
        lastSession: null,
        history: [],
      };
      return empty;
    }

    const { data: sessoes } = await supabase
      .from("sessoes_caixa")
      .select("*, perfis(nome)")
      .eq("empresa_id", empresaId)
      .order("data_abertura", { ascending: false })
      .limit(50);

    const lista = (sessoes ?? []).map(toSession);
    const aberta = lista.find((s) => s.status === "aberto") ?? null;

    return {
      state: aberta ? "aberto" : "fechado",
      canSell: Boolean(aberta),
      blockReason: aberta ? "" : "O caixa está fechado. Abra o caixa para iniciar as vendas.",
      serverNow: new Date().toISOString(),
      currentSession: aberta,
      lastSession: lista.find((s) => s.status === "fechado") ?? null,
      history: lista,
    };
  },

  async open(openingAmount: string) {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada.");

    // Caixa (terminal) padrão da empresa
    const { data: caixas } = await supabase
      .from("caixas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .limit(1);
    const caixaId = (caixas && caixas[0]?.id) ?? null;

    const { error } = await supabase
      .from("sessoes_caixa")
      .insert({
        empresa_id: empresaId,
        caixa_id: caixaId,
        usuario_id: user.id,
        valor_inicial: parseReais(openingAmount),
        status: "aberto",
      });
    if (error) throw error;

    return this.status();
  },

  async close(closingAmount: string, note = "") {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");

    const { data: aberta } = await supabase
      .from("sessoes_caixa")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("status", "aberto")
      .limit(1)
      .single();
    if (!aberta) throw new Error("Nenhum caixa aberto para fechar.");

    const { error } = await supabase
      .from("sessoes_caixa")
      .update({
        status: "fechado",
        data_fechamento: new Date().toISOString(),
        valor_informado: parseReais(closingAmount),
        observacao: note || "",
      })
      .eq("id", aberta.id);
    if (error) throw error;

    return this.status();
  },
};
