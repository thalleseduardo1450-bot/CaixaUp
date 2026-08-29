/**
 * Arquivo: src/pages/Admin/HomePage.tsx
 * Objetivo: apresenta visão resumida da operação com KPIs, gráfico de vendas e ranking de produtos mais vendidos.
 * Entradas esperadas: recebe callbacks opcionais para navegação interna e abertura da frente de caixa em nova aba.
 */

import {
  ArrowRight,
  ShoppingCart,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageHeader from "@/components/Admin/PageHeader";
import KpiTrendCard from "@/components/Admin/KpiTrendCard";
import Reveal from "@/components/Reveal";
import PageLayout from "@/layout/PageLayout";
import { homeService, type HomeKpiDto } from "@/services/api/homeService";
import { reportService } from "@/services/api/reportService";

// A tela principal mantém somente o acesso direto ao caixa.
const shortcuts = [
  {
    title: "Começar uma venda",
    description: "Abrir o caixa de atendimento",
    icon: ShoppingCart,
    primary: true,
  },
];

type HomePageProps = {
  onOpenSalesInNewTab?: () => void;
};

type TopProduct = {
  name: string;
  quantity: number;
  revenue: string;
};

type RankingPeriod = "today" | "7" | "30" | "month";

function formatMoneyBr(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getDaysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rankingStartDate(period: RankingPeriod) {
  if (period === "today") return getDaysAgoIso(0);
  if (period === "7") return getDaysAgoIso(6);
  if (period === "month") {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return getDaysAgoIso(29);
}

function buildChartSeries(cards: HomeKpiDto[]) {
  // Usa a série de tendência (últimos 7 dias) do card de faturamento quando disponível.
  const revenueCard = cards.find((card) => card.label.toLowerCase().includes("faturamento"));
  const trend = revenueCard?.trend ?? cards[0]?.trend ?? [];

  return trend.map((value, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (trend.length - 1 - index));
    const dayLabel = date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
    return { dia: dayLabel, valor: value };
  });
}

export default function HomePage({ onOpenSalesInNewTab }: HomePageProps) {
  const [cards, setCards] = useState<HomeKpiDto[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [rankingPeriod, setRankingPeriod] = useState<RankingPeriod>("30");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [home, ranking] = await Promise.all([
        homeService.get(),
        reportService.generate("produtos-mais-vendidos", {
        startDate: rankingStartDate(rankingPeriod),
        endDate: getDaysAgoIso(0),
        category: "all",
        groupBy: "daily",
        }),
      ]);
      setCards(home?.cards ?? []);
      setTopProducts(
        (ranking.rows ?? []).slice(0, 5).map((row) => {
          const quantity = Number(row.quantidade ?? 0);
          return {
            name: String(row.produto ?? "Produto sem nome"),
            quantity: Number.isFinite(quantity) ? quantity : 0,
            revenue: String(row.faturamento ?? formatMoneyBr(0)),
          };
        }),
      );
    } catch (error) {
      setCards([]);
      setTopProducts([]);
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar o dashboard.");
    } finally {
      setLoading(false);
    }
  }, [rankingPeriod]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const chartSeries = useMemo(() => buildChartSeries(cards), [cards]);
  const maxQuantity = Math.max(1, ...topProducts.map((product) => product.quantity));
  const hasProducts = topProducts.length > 0;

  return (
    <PageLayout size="full" className="space-y-4 py-4 md:space-y-6 md:py-6 lg:py-8">
      <PageHeader
        title="Dashboard"
        description="Acompanhe vendas, faturamento e desempenho do seu negócio em tempo real."
      />

      {loadError ? (
        <div className="rounded-xl border border-primary/25 bg-primary/10 p-4 text-sm text-primary" role="alert">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Não foi possível carregar os indicadores. {loadError}</span>
            <button type="button" onClick={() => void loadDashboard()} className="btn-outline-secondary">
              Tentar novamente
            </button>
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((card, index) => (
          <div
            key={card.label}
            className="card-in"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <KpiTrendCard
              label={card.label}
              value={card.value}
              hint={card.helper}
              color={card.color}
              trend={card.trend}
            />
          </div>
        ))}
        {loading && cards.length === 0
          ? Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="card h-28 animate-pulse bg-hover-light" />
            ))
          : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <Reveal className="min-w-0">
          <div className="card h-full overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary p-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Gráfico de vendas</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Faturamento diário dos últimos 7 dias.
              </p>
            </div>
          </div>

          <div className="h-64 w-full p-4">
            {chartSeries.length > 1 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={224}
                initialDimension={{ width: 720, height: 224 }}
              >
                <AreaChart data={chartSeries} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dbe2ea" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    axisLine={{ stroke: "#dbe2ea" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `${(value / 1000).toLocaleString("pt-BR")}K` : String(value)
                    }
                  />
                  <Tooltip
                    formatter={(value) => [formatMoneyBr(Number(value)), "Faturamento"]}
                    labelStyle={{ color: "#111827", fontWeight: 600 }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #dbe2ea",
                      fontSize: 13,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="valor"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fill="url(#salesArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                Sem dados de vendas no período.
              </div>
            )}
          </div>
          </div>
        </Reveal>

        <Reveal className="min-w-0" delay={90}>
          <div className="card h-full overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-primary p-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Produtos mais vendidos</h2>
              <p className="mt-1 text-sm text-text-secondary">Quantidade real de unidades vendidas.</p>
            </div>
            <select
              value={rankingPeriod}
              onChange={(event) => setRankingPeriod(event.target.value as RankingPeriod)}
              className="select-field min-w-32"
              aria-label="Período do ranking"
            >
              <option value="today">Hoje</option>
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="month">Este mês</option>
            </select>
          </div>

          <div className="divide-y divide-border-primary">
            {hasProducts ? (
              topProducts.map((product, index) => (
                <div key={product.name} className="grid gap-2 p-4 md:grid-cols-[32px_minmax(0,1fr)_auto] md:items-center">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-sm font-bold text-secondary">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">{product.name}</p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hover-light">
                      <div
                        className="h-full rounded-full bg-secondary"
                        style={{ width: `${Math.max(8, (product.quantity / maxQuantity) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-text-primary">
                      {product.quantity} {product.quantity === 1 ? "un." : "uns."}
                    </p>
                    <p className="text-xs text-text-secondary">{product.revenue}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-sm text-text-secondary">
                Ainda não existem vendas suficientes para gerar este ranking.
              </div>
            )}
          </div>
          </div>
        </Reveal>
      </section>

      <section className="card p-4 md:p-5">
        <h2 className="text-lg font-semibold text-text-primary">Acesso rápido</h2>
        <p className="mt-1 text-sm text-text-secondary">
          As funções mais usadas estão reunidas aqui.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((shortcut, index) => {
            const Icon = shortcut.icon;
            return (
                <div
                  key={shortcut.title}
                  className="card-in"
                  style={{ animationDelay: `${180 + index * 60}ms` }}
                >
                  <button
                    type="button"
                    onClick={onOpenSalesInNewTab}
                    className={`group flex h-full w-full min-h-[122px] flex-col rounded-lg border p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 ${
                      shortcut.primary
                        ? "border-accent/30 bg-accent/10"
                        : "border-border-primary bg-bg-primary hover:bg-hover-light"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                        <Icon size={18} />
                      </span>
                      <ArrowRight
                        size={16}
                        className="text-text-tertiary transition group-hover:translate-x-0.5 group-hover:text-secondary"
                      />
                    </div>

                    <p className="mt-3 text-sm font-semibold text-text-primary group-hover:text-secondary">
                      {shortcut.title}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">{shortcut.description}</p>

                    <span className="mt-auto pt-3 text-xs font-semibold text-accent">
                      Abrir
                    </span>
                  </button>
                </div>
            );
          })}
        </div>
      </section>

    </PageLayout>
  );
}
