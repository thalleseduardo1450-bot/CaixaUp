/**
 * Arquivo: src/services/api/salesHistoryService.ts
 * Objetivo: histórico de vendas e registro de venda direto no Supabase.
 * Registrar uma venda grava: vendas + itens_venda + pagamentos + baixa de
 * estoque + movimentacoes_estoque, sempre com a empresa do usuário logado.
 */
import { supabase, currentCompanyId } from "@/lib/supabase";

export type SaleHistoryDto = {
  saleNumber: string;
  customerName: string;
  customerCpf: string;
  paymentType: string;
  totalAmount: string;
  operatorName: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  itemTotal: string;
  saleDate: string;
};

export type RegisterSalePayload = {
  requestId: string;
  claimToken?: string;
  discountAmount?: number;
  customerId?: string;
  customerName: string;
  customerCpf: string;
  paymentType: string;
  totalAmount: string;
  operatorName: string;
  allowSellingWithoutStock?: boolean;
  /**
   * Venda dividida: uma linha por forma de pagamento, em REAIS. Quando vem
   * preenchido, grava uma linha em `pagamentos` para cada forma — é assim que
   * "R$ 30 no dinheiro + R$ 20 no crédito" fica auditável no banco em vez de
   * virar um texto solto. Sem isso, cai no comportamento antigo (uma linha só).
   */
  payments?: Array<{ forma: string; valor: number }>;
  items: Array<{
    productId: string;
    productCode: string;
    productName: string;
    quantity: number;
  }>;
};

/**
 * Formas aceitas pelo CHECK da tabela `pagamentos` (migração 0001).
 * Qualquer forma fora desta lista cai em "outros" — o rótulo completo continua
 * no cupom impresso, então nada se perde para o cliente.
 */
const FORMAS_ACEITAS = ["dinheiro", "pix", "debito", "credito", "cheque", "fiado", "outros"];

function formaValida(forma: string) {
  return FORMAS_ACEITAS.includes(forma) ? forma : "outros";
}

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

export const salesHistoryService = {
  async list() {
    const empresaId = await currentCompanyId();
    if (!empresaId) return [];

    const { data: vendas } = await supabase
      .from("vendas")
      .select("id, numero, status, subtotal, desconto, total, created_at, cliente_id, perfis(nome), itens_venda(produto_id, nome_produto, quantidade, preco_unitario), pagamentos(forma, valor)")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(200);

    const rows: SaleHistoryDto[] = [];
    for (const v of (vendas ?? []) as any[]) {
      const operador = v.perfis?.nome ?? "";
      const forma = (v.pagamentos?.[0]?.forma as string) ?? "";
      for (const item of v.itens_venda ?? []) {
        rows.push({
          saleNumber: String(v.numero ?? ""),
          customerName: v.cliente_id ? "" : "Consumidor",
          customerCpf: "",
          paymentType: forma,
          totalAmount: reaisToText(v.total),
          operatorName: operador,
          productCode: item.produto_id ?? "",
          productName: item.nome_produto ?? "",
          quantity: Number(item.quantidade ?? 0),
          unitPrice: reaisToText(item.preco_unitario),
          itemTotal: reaisToText(Number(item.quantidade ?? 0) * Number(item.preco_unitario ?? 0)),
          saleDate: v.created_at ?? "",
        });
      }
    }
    return rows;
  },

  async register(payload: RegisterSalePayload) {
    const items = payload.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    if (items.some((item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      throw new Error("Confira os produtos e as quantidades antes de finalizar.");
    }
    const total = parseReais(payload.totalAmount);
    const payments = payload.payments?.length
      ? payload.payments.map((payment) => ({ forma: formaValida(payment.forma), valor: payment.valor }))
      : [{ forma: formaValida(payload.paymentType), valor: total }];
    const { data, error } = await supabase.rpc("finalizar_venda", {
      p_chave: payload.requestId,
      p_claim_token: payload.claimToken || null,
      p_itens: items,
      p_pagamentos: payments,
      p_cliente: payload.customerId || null,
      p_desconto: payload.discountAmount ?? 0,
      p_total_esperado: total,
    });
    if (error) {
      throw new Error(error.code === "PGRST202"
        ? "A atualização do banco ainda não foi aplicada. Entre em contato com o suporte."
        : error.message);
    }
    return data as { saleNumber: string; saleId: string; total: number; replayed: boolean };
  },
  async print(saleNumber: string) {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada.");

    const { data: venda } = await supabase
      .from("vendas")
      .select("id, numero, total, created_at, perfis(nome), itens_venda(produto_id, nome_produto, quantidade, preco_unitario)")
      .eq("empresa_id", empresaId)
      .eq("numero", Number(saleNumber))
      .maybeSingle();

    const rows: SaleHistoryDto[] = ((venda as any)?.itens_venda ?? []).map((item: any) => ({
      saleNumber,
      customerName: "Consumidor",
      customerCpf: "",
      paymentType: "",
      totalAmount: reaisToText((venda as any)?.total),
      operatorName: (venda as any)?.perfis?.nome ?? "",
      productCode: item.produto_id ?? "",
      productName: item.nome_produto ?? "",
      quantity: Number(item.quantidade ?? 0),
      unitPrice: reaisToText(item.preco_unitario),
      itemTotal: reaisToText(Number(item.quantidade ?? 0) * Number(item.preco_unitario ?? 0)),
      saleDate: (venda as any)?.created_at ?? "",
    }));

    return {
      saleNumber,
      printedAt: new Date().toISOString(),
      items: rows.length,
      rows,
    };
  },
};
