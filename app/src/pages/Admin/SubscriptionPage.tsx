import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import PageLayout from "@/layout/PageLayout";
import { supabase } from "@/lib/supabase";
import { subscriptionService } from "@/services/api/subscriptionService";
import SubscriptionAdminPanel from "@/components/Subscription/SubscriptionAdminPanel";

type PlanCode = "gratis" | "pro" | "premium";
type Subscription = {
  companyId: string;
  plan: PlanCode;
  status: "trial" | "active" | "free";
  expiresAt: string | null;
  serverNow: string;
  cancelAtPeriodEnd: boolean;
  features: Record<string, unknown>;
};
type Plan = { codigo: PlanCode; nome: string; preco_centavos: number; recursos: unknown };

const DEFAULT_PLANS: Plan[] = [
  { codigo: "gratis", nome: "Grátis", preco_centavos: 0, recursos: {} },
  { codigo: "pro", nome: "Pro", preco_centavos: 8900, recursos: {} },
  { codigo: "premium", nome: "Premium", preco_centavos: 11900, recursos: {} },
];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlanCode(value: unknown): value is PlanCode {
  return value === "gratis" || value === "pro" || value === "premium";
}

function isSubscription(value: unknown): value is Subscription {
  return isRecord(value) && typeof value.companyId === "string" && isPlanCode(value.plan)
    && ["trial", "active", "free"].includes(String(value.status))
    && typeof value.serverNow === "string" && Number.isFinite(Date.parse(value.serverNow))
    && (value.expiresAt === null || (typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt))))
    && typeof value.cancelAtPeriodEnd === "boolean" && isRecord(value.features);
}

function checkoutUrl(value: unknown) {
  if (typeof value !== "string" || /[\s\\]/.test(value)
    || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error("Invalid checkout URL");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error("Invalid checkout URL");
  return url.href;
}

function ResourceList({ resources }: { resources: unknown }) {
  const entries = isRecord(resources) ? Object.entries(resources) : [];
  const items = Array.isArray(resources) ? resources.filter((item): item is string => typeof item === "string") : entries.flatMap(([key, value]) => {
    const label = key.replace(/_/g, " ");
    if (typeof value === "boolean") return [`${label}: ${value ? "configurado" : "não configurado"}`];
    if (typeof value === "number" || typeof value === "string") return [`${label}: ${value}`];
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) return [`${label}: ${value.join(", ")}`];
    return [];
  });
  if (!items.length) return <p className="text-sm text-text-secondary">Recursos detalhados não informados pelo servidor.</p>;
  return <ul className="list-disc space-y-1 break-words pl-5 text-sm text-text-secondary">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

export default function SubscriptionPage() {
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState({
    loading: true,
    subscription: null as Subscription | null,
    plans: DEFAULT_PLANS,
    error: "",
    catalogueWarning: "",
  });
  const [checkout, setCheckout] = useState<PlanCode | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [subscriptionAction, setSubscriptionAction] = useState(false);
  const checkoutLock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const [subscriptionResult, plansResult] = await Promise.all([
          subscriptionService.mine(controller.signal).then((data) => ({ data, error: null }), (error: unknown) => ({ data: null, error })),
          supabase.from("planos").select("codigo,nome,preco_centavos,recursos").abortSignal(controller.signal),
        ]);
        if (!active) return;
        const rows: unknown[] = Array.isArray(plansResult.data) ? plansResult.data : [];
        const configured = rows.filter((row): row is Plan => isRecord(row) && isPlanCode(row.codigo)
          && typeof row.nome === "string" && row.nome.trim().length > 0
          && typeof row.preco_centavos === "number" && Number.isSafeInteger(row.preco_centavos) && row.preco_centavos >= 0);
        const subscription = !subscriptionResult.error && isSubscription(subscriptionResult.data) ? subscriptionResult.data : null;
        setView({
          loading: false,
          subscription,
          plans: DEFAULT_PLANS.map((fallback) => configured.find((plan) => plan.codigo === fallback.codigo) ?? fallback),
          error: subscription ? "" : "Não foi possível consultar sua assinatura. Tente atualizar a página.",
          catalogueWarning: plansResult.error || DEFAULT_PLANS.some((plan) => !configured.some((row) => row.codigo === plan.codigo))
            ? "Catálogo incompleto ou indisponível. Valores não confirmados usam a referência de R$ 0, R$ 89 e R$ 119. Confirme o preço no checkout antes de pagar." : "",
        });
      } catch {
        if (active) setView((previous) => ({ ...previous, loading: false, subscription: null, error: "Não foi possível conectar ao serviço de assinaturas. Tente novamente." }));
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [revision]);

  async function startCheckout(plan: PlanCode) {
    if (plan === "gratis" || checkoutLock.current || !view.subscription || view.loading) return;
    checkoutLock.current = true;
    setCheckout(plan);
    setCheckoutError("");
    try {
      const { data, error } = await supabase.functions.invoke("billing-checkout", { body: { plan } });
      if (error || !isRecord(data)) throw new Error("Checkout unavailable");
      window.location.assign(checkoutUrl(data.url));
    } catch {
      setCheckoutError("O pagamento online está indisponível no momento. O provedor pode ainda não estar configurado. Nenhuma mudança de plano foi confirmada; tente novamente mais tarde.");
    } finally {
      checkoutLock.current = false;
      setCheckout(null);
    }
  }

  async function changeRenewal(cancel: boolean) {
    if (!subscription || subscriptionAction) return;
    setSubscriptionAction(true);
    setCheckoutError("");
    try {
      const { error } = await supabase.rpc("alterar_cancelamento_assinatura", { p_cancelar: cancel });
      if (error) throw error;
      setView((previous) => ({ ...previous, subscription: previous.subscription ? { ...previous.subscription, cancelAtPeriodEnd: cancel } : null }));
    } catch {
      setCheckoutError("Não foi possível atualizar o cancelamento. Tente novamente.");
    } finally { setSubscriptionAction(false); }
  }

  const subscription = view.subscription;
  const remaining = subscription?.expiresAt ? Date.parse(subscription.expiresAt) - Date.parse(subscription.serverNow) : null;
  const expired = remaining !== null && remaining <= 0;
  const currentName = view.plans.find((plan) => plan.codigo === subscription?.plan)?.nome;

  return (
    <PageLayout>
      <PageHeader title="Assinatura" description="Seu plano, período de acesso e opções de contratação."
        action={<button type="button" className="btn-outline-secondary" disabled={view.loading || checkout !== null} onClick={() => {
          setView((previous) => ({ ...previous, loading: true, error: "" }));
          setCheckoutError("");
          setRevision((previous) => previous + 1);
        }}>Atualizar</button>} />
      {view.loading && <p role="status" className="text-text-secondary">Consultando assinatura e preços…</p>}
      {view.error && <p role="alert" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-primary">{view.error}</p>}
      {!view.loading && subscription && (
        <section className="card space-y-3 p-5" aria-label="Assinatura atual">
          <h2 className="text-xl font-bold">Plano atual: {currentName}</h2>
          <p>{expired ? "Período encerrado" : subscription.status === "trial" ? "Em teste" : subscription.status === "active" ? "Assinatura ativa" : "Acesso gratuito"}</p>
          <p className="text-sm text-text-secondary">{subscription.expiresAt ? `Término do período: ${dateTime.format(new Date(subscription.expiresAt))}.` : "Sem data de término informada pelo servidor."}</p>
          {remaining !== null && <p className="text-sm">{expired ? "Atualize a consulta para confirmar o acesso vigente." : `${Math.ceil(remaining / 86400000)} dia(s) restante(s) na última consulta.`}</p>}
          <p className="text-sm text-text-secondary">Referência do servidor: {dateTime.format(new Date(subscription.serverNow))}. O relógio deste dispositivo não define a validade.</p>
          {subscription.cancelAtPeriodEnd && <p className="font-semibold">Cancelamento agendado para o fim do período vigente.</p>}
          {subscription.status === "active" && <button type="button" className="btn-outline-secondary" disabled={subscriptionAction} onClick={() => void changeRenewal(!subscription.cancelAtPeriodEnd)}>{subscription.cancelAtPeriodEnd ? "Reativar renovação" : "Cancelar renovação"}</button>}
          <details className="text-sm"><summary className="cursor-pointer font-semibold">Configuração da assinatura</summary><div className="mt-3"><ResourceList resources={subscription.features} /></div></details>
        </section>
      )}
      <section className="rounded-xl border border-secondary/30 bg-secondary/5 p-5">
        <h2 className="font-bold">Teste de 7 dias, não uma assinatura paga</h2>
        <p className="mt-2 text-sm text-text-secondary">O teste dura 7 dias no total, conforme o período registrado no servidor. Abrir esta página não inicia nem renova o teste. A contratação só é confirmada após o processamento do pagamento.</p>
      </section>
      {view.catalogueWarning && <p role="status" className="text-sm text-text-secondary">{view.catalogueWarning}</p>}
      {checkoutError && <p role="alert" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-primary">{checkoutError}</p>}
      <div className="grid gap-5 lg:grid-cols-3">
        {view.plans.map((plan) => {
          const current = subscription?.plan === plan.codigo && subscription.status !== "trial" && !expired;
          return (
            <section key={plan.codigo} className="card flex flex-col gap-4 p-5" aria-label={`Plano ${plan.nome}`}>
              <h2 className="text-xl font-bold">{plan.nome}{current ? " · Atual" : ""}</h2>
              <p className="text-3xl font-bold text-secondary">{money.format(plan.preco_centavos / 100)}<span className="text-sm font-normal text-text-secondary"> / mês</span></p>
              {plan.codigo === "gratis" ? (
                <ul className="list-disc space-y-2 pl-5 text-sm text-text-secondary">
                  <li>Até 50 produtos</li><li>1 usuário</li><li>1 venda suspensa</li><li>Histórico de 7 dias</li><li>Vendas somente em dinheiro</li>
                </ul>
              ) : <div className="space-y-2"><h3 className="font-semibold">Configuração de recursos</h3><ResourceList resources={plan.recursos} /></div>}
              {plan.codigo === "premium" && <p className="rounded-lg border border-border-primary bg-bg-primary p-3 text-sm text-text-secondary"><strong>Recursos exclusivos futuros: ainda não disponíveis.</strong> A configuração do catálogo não é promessa de entrega. Contratar o Premium não libera módulos ainda não lançados; não há data de lançamento confirmada nesta página.</p>}
              <div className="mt-auto pt-2">
                {plan.codigo === "gratis" ? <p className="text-sm text-text-secondary">Plano de entrada. Esta página não cancela uma assinatura paga.</p> : (
                  <button type="button" className="btn-primary w-full" disabled={view.loading || !subscription || checkout !== null || current} onClick={() => void startCheckout(plan.codigo)}>
                    {checkout === plan.codigo ? "Abrindo pagamento…" : current ? "Plano atual" : `Contratar ${plan.nome}`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-sm text-text-secondary">Revise valor, periodicidade e condições no checkout antes de confirmar. Preços e recursos podem ser atualizados no catálogo da plataforma.</p>
      <SubscriptionAdminPanel />
    </PageLayout>
  );
}
