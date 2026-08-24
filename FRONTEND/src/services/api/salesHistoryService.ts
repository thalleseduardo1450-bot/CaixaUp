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
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada. Faça login novamente.");

    // Sessão de caixa aberta
    const { data: sessao } = await supabase
      .from("sessoes_caixa")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("status", "aberto")
      .limit(1)
      .maybeSingle();

    // Resolve cliente (por nome, se existir) — senão venda sem cliente
    let clienteId: string | null = null;
    if (payload.customerId) {
      const { data: cliente } = await supabase
        .from("clientes")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("id", payload.customerId)
        .maybeSingle();
      if (cliente) clienteId = cliente.id;
    } else if (payload.customerName && payload.customerName !== "Consumidor") {
      const { data: cliente } = await supabase
        .from("clientes")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("nome", payload.customerName)
        .limit(1)
        .maybeSingle();
      if (cliente) clienteId = cliente.id;
    }

    // Busca os produtos pelos códigos para usar o PREÇO REAL do banco
    const codigos = payload.items.map((i) => i.productCode).filter(Boolean);
    const { data: produtos, error: produtosError } = codigos.length
      ? await supabase
          .from("produtos")
          .select("id, nome, codigo_barras, sku, preco_venda, estoque_atual")
          .eq("empresa_id", empresaId)
          .in("codigo_barras", codigos)
      : { data: [], error: null };
    if (produtosError) throw produtosError;

    const produtoPorCodigo = new Map<string, any>();
    for (const p of (produtos ?? []) as any[]) {
      produtoPorCodigo.set(p.codigo_barras || p.sku, p);
    }

    let subtotal = 0;
    const itensParaGravar: any[] = [];
    for (const item of payload.items) {
      const produto = produtoPorCodigo.get(item.productCode);
      const preco = Number(produto?.preco_venda ?? 0);
      const quantidade = Math.max(1, Number(item.quantity ?? 1));
      subtotal += preco * quantidade;
      itensParaGravar.push({ produto, nome: item.productName || produto?.nome || "Item", quantidade, preco });
    }

    const total = parseReais(payload.totalAmount) || subtotal;

    // Cria a venda
    const { data: venda, error: errVenda } = await supabase
      .from("vendas")
      .insert({
        empresa_id: empresaId,
        sessao_caixa_id: sessao?.id ?? null,
        usuario_id: user.id,
        cliente_id: clienteId,
        status: "concluida",
        subtotal,
        desconto: Math.max(0, subtotal - total),
        total,
      })
      .select()
      .single();
    if (errVenda) throw errVenda;

    // Itens + baixa de estoque
    for (const item of itensParaGravar) {
      const { error: itemError } = await supabase.from("itens_venda").insert({
        empresa_id: empresaId,
        venda_id: venda.id,
        produto_id: item.produto?.id ?? null,
        nome_produto: item.nome,
        quantidade: item.quantidade,
        preco_unitario: item.preco,
        desconto: 0,
        subtotal: item.preco * item.quantidade,
      });
      if (itemError) throw itemError;

      if (item.produto) {
        const anterior = Number(item.produto.estoque_atual ?? 0);
        const novo = Math.max(0, anterior - item.quantidade);
        const { error: stockError } = await supabase
          .from("produtos")
          .update({ estoque_atual: novo })
          .eq("id", item.produto.id);
        if (stockError) throw stockError;
        const { error: movementError } = await supabase.from("movimentacoes_estoque").insert({
          empresa_id: empresaId,
          produto_id: item.produto.id,
          usuario_id: user.id,
          tipo: "venda",
          quantidade: item.quantidade,
          estoque_anterior: anterior,
          estoque_novo: novo,
          motivo: "Venda #" + venda.numero,
          referencia_id: venda.id,
        });
        if (movementError) throw movementError;
      }
    }

    // Pagamentos: uma linha por forma quando a venda foi dividida.
    const linhasPagamento = (payload.payments ?? []).filter((p) => Number(p.valor) > 0);
    if (linhasPagamento.length > 0) {
      const { error: paymentError } = await supabase.from("pagamentos").insert(
        linhasPagamento.map((p) => ({
          empresa_id: empresaId,
          venda_id: venda.id,
          forma: formaValida(p.forma),
          valor: Number(p.valor),
        })),
      );
      if (paymentError) throw paymentError;
    } else {
      const { error: paymentError } = await supabase.from("pagamentos").insert({
        empresa_id: empresaId,
        venda_id: venda.id,
        forma: formaValida(payload.paymentType || "dinheiro"),
        valor: total,
      });
      if (paymentError) throw paymentError;
    }

    const accountAmount = linhasPagamento
      .filter((payment) => payment.forma === "fiado")
      .reduce((sum, payment) => sum + Number(payment.valor), 0);
    if (accountAmount > 0) {
      if (!clienteId) throw new Error("Identifique o cliente antes de deixar a venda fiada.");
      const { error: accountError } = await supabase.rpc("registrar_debito_cliente", {
        p_cliente_id: clienteId,
        p_venda_id: venda.id,
        p_valor: accountAmount,
        p_descricao: `Venda #${venda.numero}`,
      });
      if (accountError) throw accountError;
    }

    return { saleNumber: String(venda.numero ?? "") };
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
