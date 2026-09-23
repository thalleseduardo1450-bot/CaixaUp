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

export type CashRegisterProductSummaryDto = {
  name: string;
  quantity: number;
  total: number;
};

export type CashRegisterSummaryDto = {
  saleCount: number;
  itemCount: number;
  totalSales: number;
  totalReceived: number;
  paymentTotals: Record<string, number>;
  products: CashRegisterProductSummaryDto[];
};

const EMPTY_SUMMARY: CashRegisterSummaryDto = {
  saleCount: 0,
  itemCount: 0,
  totalSales: 0,
  totalReceived: 0,
  paymentTotals: {},
  products: [],
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

  async summary(sessionId?: string | null): Promise<CashRegisterSummaryDto> {
    const empresaId = await currentCompanyId();
    if (!empresaId || !sessionId) return { ...EMPTY_SUMMARY };

    const { data, error } = await supabase
      .from("vendas")
      .select("id, total, status, itens_venda(nome_produto, quantidade, preco_unitario, subtotal), pagamentos(forma, valor)")
      .eq("empresa_id", empresaId)
      .eq("sessao_caixa_id", sessionId)
      .eq("status", "concluida")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const paymentTotals: Record<string, number> = {};
    const products = new Map<string, CashRegisterProductSummaryDto>();
    let totalSales = 0;
    let totalReceived = 0;
    let itemCount = 0;

    for (const sale of data ?? []) {
      totalSales += Number(sale.total ?? 0);
      for (const payment of sale.pagamentos ?? []) {
        const method = String(payment.forma || "outros").toLowerCase();
        const amount = Number(payment.valor ?? 0);
        paymentTotals[method] = (paymentTotals[method] ?? 0) + amount;
        if (method !== "fiado") totalReceived += amount;
      }
      for (const item of sale.itens_venda ?? []) {
        const name = String(item.nome_produto || "Produto sem nome");
        const quantity = Number(item.quantidade ?? 0);
        const itemTotal = Number(item.subtotal ?? Number(item.preco_unitario ?? 0) * quantity);
        const current = products.get(name) ?? { name, quantity: 0, total: 0 };
        current.quantity += quantity;
        current.total += itemTotal;
        itemCount += quantity;
        products.set(name, current);
      }
    }

    return {
      saleCount: data?.length ?? 0,
      itemCount,
      totalSales,
      totalReceived,
      paymentTotals,
      products: [...products.values()].sort((left, right) => right.quantity - left.quantity),
    };
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
