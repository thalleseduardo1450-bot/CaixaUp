/**
 * Arquivo: src/services/api/homeService.ts
 * Objetivo: indicadores da página inicial calculados direto no Supabase.
 * KPIs: vendas hoje, faturamento de hoje, produtos cadastrados, estoque baixo.
 */
import { supabase, currentCompanyId } from "@/lib/supabase";

export type HomeKpiDto = {
  label: string;
  value: string;
  helper: string;
  color: string;
  trend: number[];
};

function inicioDoDia(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function inicioDosUltimosSeteDias(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - 6);
  return date.toISOString();
}

function fmtBRL(centavosOuReais: number): string {
  return Number(centavosOuReais ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export const homeService = {
  async get() {
    const empresaId = await currentCompanyId();
    if (!empresaId) {
      return { cards: [] as HomeKpiDto[] };
    }

    const hoje = inicioDoDia();

    const { data: vendasSemana, error: vendasError } = await supabase
      .from("vendas")
      .select("total, created_at")
      .eq("empresa_id", empresaId)
      .eq("status", "concluida")
      .gte("created_at", inicioDosUltimosSeteDias())
      .order("created_at", { ascending: true });
    if (vendasError) throw vendasError;

    const vendasHoje = (vendasSemana ?? []).filter(
      (sale) => String(sale.created_at ?? "") >= hoje,
    );

    const faturamento = (vendasHoje ?? []).reduce((s, v: any) => s + Number(v.total ?? 0), 0);

    const { count: produtos, error: produtosError } = await supabase
      .from("produtos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq("ativo", true);
    if (produtosError) throw produtosError;

    const { data: prods, error: estoqueError } = await supabase
      .from("produtos")
      .select("estoque_atual, estoque_minimo")
      .eq("empresa_id", empresaId)
      .eq("ativo", true);
    if (estoqueError) throw estoqueError;
    const estoqueBaixo = (prods ?? []).filter(
      (p: any) => Number(p.estoque_atual) <= Number(p.estoque_minimo),
    ).length;
    const trend = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (6 - index));
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      return (vendasSemana ?? [])
        .filter((sale) => {
          const saleDate = new Date(String(sale.created_at ?? ""));
          return saleDate >= day && saleDate < nextDay;
        })
        .reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
    });

    return {
      cards: [
        {
          label: "Vendas hoje",
          value: String((vendasHoje ?? []).length),
          helper: "vendas concluídas",
          color: "#2563EB",
          trend,
        },
        {
          label: "Faturamento hoje",
          value: fmtBRL(faturamento),
          helper: "total do dia",
          color: "#16A34A",
          trend,
        },
        {
          label: "Produtos cadastrados",
          value: String(produtos ?? 0),
          helper: "ativos",
          color: "#F59E0B",
          trend: [],
        },
        {
          label: "Estoque baixo",
          value: String(estoqueBaixo),
          helper: "produtos no mínimo",
          color: "#DC2626",
          trend: [],
        },
      ] as HomeKpiDto[],
    };
  },
};
