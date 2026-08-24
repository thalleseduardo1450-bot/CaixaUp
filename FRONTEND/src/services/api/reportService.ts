import type {
  ReportFilterValues,
  ReportResultColumn,
  ReportResultRow,
} from "@/components/Admin/ReportsPage/reportResultTypes";
import { currentCompanyId, supabase } from "@/lib/supabase";

type ReportResult = { columns: ReportResultColumn[]; rows: ReportResultRow[] };

function textFilter(filters: ReportFilterValues, key: string) {
  const value = filters[key];
  return typeof value === "string" ? value : "";
}

function startIso(filters: ReportFilterValues) {
  const value = textFilter(filters, "startDate");
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function endExclusiveIso(filters: ReportFilterValues) {
  const value = textFilter(filters, "endDate");
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

function dayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function salesByPeriod(empresaId: string, filters: ReportFilterValues): Promise<ReportResult> {
  let query = supabase
    .from("vendas")
    .select("id, total, created_at")
    .eq("empresa_id", empresaId)
    .eq("status", "concluida")
    .order("created_at", { ascending: true });
  const start = startIso(filters);
  const end = endExclusiveIso(filters);
  if (start) query = query.gte("created_at", start);
  if (end) query = query.lt("created_at", end);
  const { data, error } = await query;
  if (error) throw error;

  const grouped = new Map<string, { revenue: number; sales: number }>();
  for (const sale of data ?? []) {
    const key = dayKey(String(sale.created_at ?? ""));
    const current = grouped.get(key) ?? { revenue: 0, sales: 0 };
    current.revenue += Number(sale.total ?? 0);
    current.sales += 1;
    grouped.set(key, current);
  }

  return {
    columns: [
      { key: "periodo", label: "Período" },
      { key: "vendas", label: "Vendas" },
      { key: "faturamento", label: "Faturamento" },
      { key: "ticketMedio", label: "Ticket médio" },
    ],
    rows: Array.from(grouped, ([periodo, values]) => ({
      periodo,
      vendas: values.sales,
      faturamento: brl(values.revenue),
      ticketMedio: brl(values.sales > 0 ? values.revenue / values.sales : 0),
    })),
  };
}

async function topProducts(empresaId: string, filters: ReportFilterValues): Promise<ReportResult> {
  let query = supabase
    .from("itens_venda")
    .select("produto_id, nome_produto, quantidade, preco_unitario, subtotal, vendas!inner(status, created_at)")
    .eq("empresa_id", empresaId)
    .eq("vendas.status", "concluida");
  const start = startIso(filters);
  const end = endExclusiveIso(filters);
  if (start) query = query.gte("vendas.created_at", start);
  if (end) query = query.lt("vendas.created_at", end);
  const { data, error } = await query;
  if (error) throw error;

  const grouped = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of (data ?? []) as Array<Record<string, unknown>>) {
    const name = String(item.nome_produto || "Produto sem nome");
    const key = String(item.produto_id || name).toLocaleLowerCase("pt-BR");
    const current = grouped.get(key) ?? { name, quantity: 0, revenue: 0 };
    const quantity = Number(item.quantidade ?? 0);
    const unitPrice = Number(item.preco_unitario ?? 0);
    const subtotal = Number(item.subtotal ?? quantity * unitPrice);
    current.quantity += Number.isFinite(quantity) ? quantity : 0;
    current.revenue += Number.isFinite(subtotal) ? subtotal : 0;
    grouped.set(key, current);
  }

  return {
    columns: [
      { key: "posicao", label: "Posição" },
      { key: "produto", label: "Produto" },
      { key: "quantidade", label: "Quantidade vendida" },
      { key: "faturamento", label: "Faturamento" },
    ],
    rows: Array.from(grouped.values())
      .sort((left, right) => right.quantity - left.quantity || right.revenue - left.revenue)
      .map((product, index) => ({
        posicao: `${index + 1}º`,
        produto: product.name,
        quantidade: product.quantity,
        faturamento: brl(product.revenue),
      })),
  };
}

async function salesHistory(empresaId: string, filters: ReportFilterValues): Promise<ReportResult> {
  let query = supabase
    .from("vendas")
    .select("numero, total, status, created_at, perfis(nome), itens_venda(quantidade), pagamentos(forma)")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (!filters.onlyCanceled) query = query.eq("status", "concluida");
  const start = startIso(filters);
  const end = endExclusiveIso(filters);
  if (start) query = query.gte("created_at", start);
  if (end) query = query.lt("created_at", end);
  const { data, error } = await query;
  if (error) throw error;

  return {
    columns: [
      { key: "numero", label: "Número" },
      { key: "data", label: "Data" },
      { key: "operador", label: "Operador" },
      { key: "itens", label: "Itens" },
      { key: "pagamento", label: "Pagamento" },
      { key: "total", label: "Total" },
      { key: "status", label: "Status" },
    ],
    rows: ((data ?? []) as Array<Record<string, any>>).map((sale) => ({
      numero: String(sale.numero ?? ""),
      data: dateTime(String(sale.created_at ?? "")),
      operador: String(sale.perfis?.nome ?? "-"),
      itens: (sale.itens_venda ?? []).reduce(
        (sum: number, item: Record<string, unknown>) => sum + Number(item.quantidade ?? 0),
        0,
      ),
      pagamento: (sale.pagamentos ?? []).map((payment: Record<string, unknown>) => payment.forma).join(" + ") || "-",
      total: brl(Number(sale.total ?? 0)),
      status: sale.status === "concluida" ? "Concluída" : "Cancelada",
    })),
  };
}

async function criticalStock(empresaId: string, filters: ReportFilterValues): Promise<ReportResult> {
  const { data, error } = await supabase
    .from("produtos")
    .select("nome, codigo_barras, sku, estoque_atual, estoque_minimo, preco_venda")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("estoque_atual", { ascending: true });
  if (error) throw error;
  const onlyOut = Boolean(filters.onlyOutOfStock);
  const rows = (data ?? [])
    .filter((product) => {
      const current = Number(product.estoque_atual ?? 0);
      return onlyOut ? current <= 0 : current <= Number(product.estoque_minimo ?? 0);
    })
    .map((product) => ({
      produto: String(product.nome ?? "Produto sem nome"),
      codigo: String(product.codigo_barras || product.sku || "-"),
      estoqueAtual: Number(product.estoque_atual ?? 0),
      estoqueMinimo: Number(product.estoque_minimo ?? 0),
      preco: brl(Number(product.preco_venda ?? 0)),
    }));
  return {
    columns: [
      { key: "produto", label: "Produto" },
      { key: "codigo", label: "Código" },
      { key: "estoqueAtual", label: "Estoque atual" },
      { key: "estoqueMinimo", label: "Estoque mínimo" },
      { key: "preco", label: "Preço" },
    ],
    rows,
  };
}

async function stockMovement(empresaId: string, filters: ReportFilterValues): Promise<ReportResult> {
  let query = supabase
    .from("movimentacoes_estoque")
    .select("tipo, quantidade, estoque_anterior, estoque_novo, motivo, created_at, produtos(nome)")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false })
    .limit(500);
  const start = startIso(filters);
  const end = endExclusiveIso(filters);
  if (start) query = query.gte("created_at", start);
  if (end) query = query.lt("created_at", end);
  const { data, error } = await query;
  if (error) throw error;
  return {
    columns: [
      { key: "data", label: "Data" },
      { key: "produto", label: "Produto" },
      { key: "tipo", label: "Tipo" },
      { key: "quantidade", label: "Quantidade" },
      { key: "saldo", label: "Saldo" },
      { key: "motivo", label: "Motivo" },
    ],
    rows: ((data ?? []) as Array<Record<string, any>>).map((movement) => ({
      data: dateTime(String(movement.created_at ?? "")),
      produto: String(movement.produtos?.nome ?? "Produto removido"),
      tipo: String(movement.tipo ?? "-").toLocaleUpperCase("pt-BR"),
      quantidade: Number(movement.quantidade ?? 0),
      saldo: `${Number(movement.estoque_anterior ?? 0)} → ${Number(movement.estoque_novo ?? 0)}`,
      motivo: String(movement.motivo ?? "-"),
    })),
  };
}

export const reportService = {
  async generate(reportId: string, filters: ReportFilterValues): Promise<ReportResult> {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao usuário atual.");
    switch (reportId) {
      case "vendas-periodo": return salesByPeriod(empresaId, filters);
      case "produtos-mais-vendidos": return topProducts(empresaId, filters);
      case "historico-vendas": return salesHistory(empresaId, filters);
      case "estoque-critico": return criticalStock(empresaId, filters);
      case "movimento-estoque": return stockMovement(empresaId, filters);
      default: return { columns: [], rows: [] };
    }
  },
};
