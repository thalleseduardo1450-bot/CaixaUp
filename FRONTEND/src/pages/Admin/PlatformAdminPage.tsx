import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import PageLayout from "@/layout/PageLayout";
import { supabase } from "@/lib/supabase";

type Factor = { id: string; name: string };
type Access = { stage: "checking" | "restricted" } | { stage: "error"; message: string }
  | { stage: "mfa"; factors: Factor[] } | { stage: "allowed"; role: string };
type Company = {
  id: string;
  nome: string;
  email: string | null;
  ativo: boolean;
  plano: string | null;
  plano_efetivo: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
};
type Account = {
  usuario_id: string;
  nome_usuario: string;
  email: string;
  cargo: string;
  usuario_ativo: boolean;
  empresa_id: string | null;
  empresa: string | null;
  empresa_ativa: boolean | null;
  plano: string | null;
  plano_efetivo: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
};
type Invoice = {
  id: string;
  numero: number;
  empresa_id: string;
  empresa: string;
  plano: string;
  valor_centavos: number;
  desconto_centavos: number;
  vencimento: string;
  status: string;
  observacao: string;
  criado_em: string;
};
type PlanCode = "gratis" | "pro" | "premium";
type Enrollment = { id: string; qr: string; secret: string };
const planNames: Record<string, string> = { gratis: "Grátis", pro: "Pro", premium: "Premium" };

function formatDate(value: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "Data inválida";
}

function qrImage(value: string) {
  if (value.trimStart().startsWith("<svg") || value.trimStart().startsWith("<?xml")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  }
  const match = /^data:image\/svg\+xml(?:;(?:charset=utf-8|utf-8))?,([\s\S]+)$/i.exec(value);
  if (match) {
    const svg = match[1].trimStart().startsWith("<") ? match[1] : decodeURIComponent(match[1]);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  if (/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=\r\n]+$/i.test(value)) return value;
  throw new Error("QR indisponível");
}

async function readAccess(): Promise<Access> {
  const userResult = await supabase.auth.getUser();
  if (userResult.error?.name === "AuthSessionMissingError") return { stage: "restricted" };
  if (userResult.error) throw userResult.error;
  if (!userResult.data.user) return { stage: "restricted" };
  const [factors, assurance] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (factors.error) throw factors.error;
  if (assurance.error) throw assurance.error;
  if (assurance.data.currentLevel !== "aal2") {
    return { stage: "mfa", factors: factors.data.totp.map((factor) => ({ id: factor.id, name: factor.friendly_name || "Aplicativo autenticador" })) };
  }
  const { data: role, error } = await supabase.rpc("papel_plataforma");
  if (error) throw error;
  return typeof role === "string" && role.trim() ? { stage: "allowed", role } : { stage: "restricted" };
}

function isCompany(value: unknown): value is Company {
  if (typeof value !== "object" || value === null) return false;
  const company = value as Record<string, unknown>;
  return typeof company.id === "string" && typeof company.nome === "string" && typeof company.ativo === "boolean"
    && ["email", "plano", "plano_efetivo", "trial_ends_at", "paid_until"].every((key) => company[key] === null || typeof company[key] === "string");
}

function isAccount(value: unknown): value is Account {
  if (typeof value !== "object" || value === null) return false;
  const account = value as Record<string, unknown>;
  return typeof account.usuario_id === "string" && typeof account.nome_usuario === "string"
    && typeof account.email === "string" && typeof account.usuario_ativo === "boolean";
}

function isInvoice(value: unknown): value is Invoice {
  if (typeof value !== "object" || value === null) return false;
  const invoice = value as Record<string, unknown>;
  return typeof invoice.id === "string" && typeof invoice.numero === "number"
    && typeof invoice.valor_centavos === "number" && typeof invoice.vencimento === "string";
}

function formatCents(value: number) {
  return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PlatformAdminPage() {
  const [access, setAccess] = useState<Access>({ stage: "checking" });
  const [authRevision, setAuthRevision] = useState(0);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [operation, setOperation] = useState<string | null>(null);
  const operationLock = useRef(false);
  const [feedback, setFeedback] = useState({ error: "", success: "" });
  const [query, setQuery] = useState({ search: "", page: 1 });
  const [revision, setRevision] = useState(0);
  const [list, setList] = useState({ loading: true, companies: [] as Company[], error: "" });
  const [accounts, setAccounts] = useState({ loading: true, rows: [] as Account[], error: "" });
  const [invoices, setInvoices] = useState({ loading: false, rows: [] as Invoice[], error: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [change, setChange] = useState({ plan: "gratis" as PlanCode, until: "", discount: "0", reason: "" });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "MFA_CHALLENGE_VERIFIED") return;
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setAccess({ stage: event === "SIGNED_OUT" ? "restricted" : "checking" });
        setEnrollment(null);
        setCode("");
        setFactorId("");
        setSelectedId(null);
        setList({ loading: true, companies: [], error: "" });
        setAccounts({ loading: true, rows: [], error: "" });
        setInvoices({ loading: false, rows: [], error: "" });
        setFeedback({ error: "", success: "" });
        setAuthRevision((previous) => previous + 1);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    readAccess().then((result) => { if (active) setAccess(result); }).catch(() => {
      if (active) setAccess({ stage: "error", message: "Não foi possível verificar sua sessão e permissão. Entre novamente ou tente outra vez." });
    });
    return () => { active = false; };
  }, [authRevision]);

  useEffect(() => {
    if (access.stage !== "allowed") return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const [companiesResult, accountsResult] = await Promise.all([
          supabase.rpc("admin_empresas", { p_busca: query.search.trim(), p_pagina: query.page }).abortSignal(controller.signal),
          supabase.rpc("admin_contas", { p_busca: query.search.trim(), p_pagina: query.page }).abortSignal(controller.signal),
        ]);
        if (companiesResult.error || !Array.isArray(companiesResult.data) || !companiesResult.data.every(isCompany)) throw new Error("Lista indisponível");
        if (accountsResult.error || !Array.isArray(accountsResult.data) || !accountsResult.data.every(isAccount)) throw new Error("Contas indisponíveis");
        if (active) {
          setList({ loading: false, companies: companiesResult.data, error: "" });
          setAccounts({ loading: false, rows: accountsResult.data, error: "" });
        }
      } catch {
        if (active) setList({ loading: false, companies: [], error: "Não foi possível consultar as empresas. Verifique sua permissão e tente novamente." });
        if (active) setAccounts({ loading: false, rows: [], error: "Não foi possível consultar as contas cadastradas." });
      }
    }, 350);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [access, query, revision]);

  useEffect(() => {
    if (access.stage !== "allowed" || !selectedId) {
      setInvoices({ loading: false, rows: [], error: "" });
      return;
    }
    let active = true;
    setInvoices({ loading: true, rows: [], error: "" });
    supabase.rpc("admin_faturas", { p_empresa: selectedId }).then(({ data, error }) => {
      if (!active) return;
      if (error || !Array.isArray(data) || !data.every(isInvoice)) {
        setInvoices({ loading: false, rows: [], error: "Não foi possível consultar as faturas." });
        return;
      }
      setInvoices({ loading: false, rows: data, error: "" });
    });
    return () => { active = false; };
  }, [access, selectedId, revision]);

  async function enroll() {
    if (operationLock.current || access.stage !== "mfa") return;
    operationLock.current = true;
    setOperation("enroll");
    setFeedback({ error: "", success: "" });
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setEnrollment({ id: data.id, qr: qrImage(data.totp.qr_code), secret: data.totp.secret });
      setCode("");
    } catch {
      setFeedback({ error: "Não foi possível cadastrar o autenticador. Tente novamente ou procure o administrador responsável pelo acesso.", success: "" });
    } finally { operationLock.current = false; setOperation(null); }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operationLock.current || access.stage !== "mfa") return;
    const selectedFactor = enrollment?.id || factorId || access.factors[0]?.id;
    if (!selectedFactor || !/^\d{6}$/.test(code)) {
      setFeedback({ error: "Informe os 6 dígitos do aplicativo autenticador.", success: "" });
      return;
    }
    operationLock.current = true;
    setOperation("verify");
    setFeedback({ error: "", success: "" });
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: selectedFactor, code });
      if (error) throw error;
      const nextAccess = await readAccess();
      setAccess(nextAccess);
      setEnrollment(null);
      setCode("");
      if (nextAccess.stage === "mfa") throw new Error("MFA não confirmada");
    } catch {
      setFeedback({ error: "Não foi possível confirmar o acesso. Confira o código atual do autenticador e tente novamente.", success: "" });
    } finally { operationLock.current = false; setOperation(null); }
  }

  const selected = list.companies.find((company) => company.id === selectedId);
  const superadmin = access.stage === "allowed" && access.role === "superadmin";

  async function mutate(kind: "plan" | "block") {
    if (!selected || !superadmin || operationLock.current || list.loading) return;
    const reason = change.reason.trim();
    if (!reason) { setFeedback({ error: "Informe o motivo da alteração para o registro de auditoria.", success: "" }); return; }
    const until = change.until ? new Date(change.until) : null;
    if (kind === "plan" && change.plan !== "gratis" && (!until || !Number.isFinite(until.getTime()))) {
      setFeedback({ error: "Informe uma data e hora válidas para o fim do acesso pago.", success: "" });
      return;
    }
    const block = selected.ativo;
    if (kind === "block" && !window.confirm(`${block ? "Bloquear" : "Desbloquear"} a empresa ${selected.nome}?\nMotivo: ${reason}${block ? "\nO acesso da empresa será interrompido." : ""}`)) return;
    operationLock.current = true;
    setOperation(kind);
    setFeedback({ error: "", success: "" });
    try {
      const currentAccess = await readAccess();
      if (currentAccess.stage !== "allowed" || currentAccess.role !== "superadmin") {
        setAccess(currentAccess);
        throw new Error("Acesso restrito");
      }
      const result = kind === "plan"
        ? await supabase.rpc("admin_alterar_assinatura", { p_empresa: selected.id, p_plano: change.plan, p_ate: change.plan === "gratis" ? null : until!.toISOString(), p_motivo: reason })
        : await supabase.rpc("admin_bloquear_empresa", { p_empresa: selected.id, p_bloquear: block, p_motivo: reason });
      if (result.error) throw result.error;
      setFeedback({ error: "", success: "Alteração registrada. Atualizando os dados da empresa." });
      setChange((previous) => ({ ...previous, reason: "" }));
      setList((previous) => ({ ...previous, loading: true, error: "" }));
      setRevision((previous) => previous + 1);
    } catch {
      setFeedback({ error: "Não foi possível registrar a alteração. Verifique a permissão, os dados e a conexão antes de tentar novamente.", success: "" });
    } finally { operationLock.current = false; setOperation(null); }
  }

  function changeQuery(next: typeof query) {
    setQuery(next);
    setSelectedId(null);
    setList({ loading: true, companies: [], error: "" });
    setFeedback({ error: "", success: "" });
  }

  async function generateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !superadmin || operationLock.current) return;
    const discount = Number(change.discount.replace(",", "."));
    const discountCents = Math.round(discount * 100);
    const due = new Date(change.until);
    if (!change.until || !Number.isFinite(due.getTime()) || discountCents < 0) {
      setFeedback({ error: "Informe vencimento e desconto válidos.", success: "" });
      return;
    }
    operationLock.current = true;
    setOperation("invoice");
    setFeedback({ error: "", success: "" });
    try {
      const { error } = await supabase.rpc("admin_gerar_fatura", {
        p_empresa: selected.id,
        p_plano: change.plan,
        p_vencimento: due.toISOString(),
        p_desconto_centavos: discountCents,
        p_observacao: change.reason.trim(),
      });
      if (error) throw error;
      setFeedback({ error: "", success: "Fatura gerada e registrada no histórico." });
      setInvoices((previous) => ({ ...previous, loading: true }));
      setRevision((previous) => previous + 1);
    } catch {
      setFeedback({ error: "Não foi possível gerar a fatura. Confira o plano, o desconto e o vencimento.", success: "" });
    } finally { operationLock.current = false; setOperation(null); }
  }

  return (
    <PageLayout size="wide">
      <PageHeader title="Administração da plataforma" description="Consulta e gestão de empresas com permissão de plataforma e autenticação em duas etapas." />
      {feedback.error && <p role="alert" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-primary">{feedback.error}</p>}
      {feedback.success && <p role="status" className="rounded-xl border border-success/30 bg-success/5 p-4 text-success">{feedback.success}</p>}
      {access.stage === "checking" && <p role="status">Verificando sessão e permissão…</p>}
      {access.stage === "restricted" && <section className="card space-y-2 p-5"><h2 className="text-xl font-bold">Acesso restrito</h2><p className="text-text-secondary">Sua conta não possui acesso à administração da plataforma. Procure o administrador responsável. Não é possível atribuir essa permissão por esta página.</p></section>}
      {access.stage === "error" && <section className="card space-y-3 p-5"><p role="alert">{access.message}</p><button type="button" className="btn-outline-secondary" onClick={() => { setAccess({ stage: "checking" }); setAuthRevision((previous) => previous + 1); }}>Tentar novamente</button></section>}
      {access.stage === "mfa" && (
        <section className="card max-w-xl space-y-4 p-5">
          <h2 className="text-xl font-bold">Confirme com seu autenticador</h2>
          <p className="text-sm text-text-secondary">A verificação em duas etapas é obrigatória. Concluir o MFA não concede um papel administrativo; a permissão será consultada no servidor.</p>
          {enrollment ? (
            <div className="space-y-3">
              <p className="text-sm">Escaneie no aplicativo autenticador e informe o código gerado. Não compartilhe esta chave.</p>
              <img src={enrollment.qr} width={220} height={220} alt="QR de configuração do autenticador" className="rounded-lg bg-white p-3" />
              <details><summary className="cursor-pointer text-sm font-semibold">Digitar chave manualmente</summary><code className="mt-2 block break-all rounded-lg border border-border-primary p-3">{enrollment.secret}</code></details>
            </div>
          ) : access.factors.length ? (
            <label className="block space-y-2 text-sm font-semibold">Autenticador
              <select className="input-field w-full" value={factorId || access.factors[0].id} disabled={operation !== null} onChange={(event) => setFactorId(event.target.value)}>
                {access.factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.name}</option>)}
              </select>
            </label>
          ) : <button type="button" className="btn-primary" disabled={operation !== null} onClick={() => void enroll()}>{operation === "enroll" ? "Preparando…" : "Cadastrar autenticador"}</button>}
          {(enrollment || access.factors.length > 0) && (
            <form onSubmit={(event) => void verify(event)} className="space-y-3">
              <label className="block space-y-2 text-sm font-semibold">Código de 6 dígitos
                <input className="input-field w-full" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={operation !== null} required />
              </label>
              <button type="submit" className="btn-primary" disabled={operation !== null || code.length !== 6}>{operation === "verify" ? "Verificando…" : "Confirmar acesso"}</button>
            </form>
          )}
        </section>
      )}
      {access.stage === "allowed" && (
        <>
          <p className="text-sm text-text-secondary">Papel: {access.role}. {superadmin ? "Alterações exigem um motivo e validação no servidor." : "Acesso somente para consulta."}</p>
          <section className="card space-y-4 p-5" aria-label="Contas cadastradas">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Contas cadastradas</h2><p className="text-sm text-text-secondary">Todos os e-mails, empresas, planos e vencimentos.</p></div><span className="text-sm text-text-secondary">{accounts.rows.length} nesta página</span></div>
            {accounts.loading ? <p role="status">Consultando contas…</p> : accounts.error ? <p role="alert" className="text-primary">{accounts.error}</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Contas cadastradas</caption><thead><tr className="border-b border-border-primary"><th className="p-3">Usuário</th><th className="p-3">Empresa</th><th className="p-3">Plano</th><th className="p-3">Vencimento</th><th className="p-3">Status</th></tr></thead><tbody>{accounts.rows.map((account) => <tr key={account.usuario_id} className="border-b border-border-primary"><td className="p-3"><strong>{account.nome_usuario || "Sem nome"}</strong><br /><span className="break-all text-text-secondary">{account.email}</span></td><td className="p-3">{account.empresa || "Sem empresa"}</td><td className="p-3">{planNames[account.plano_efetivo || ""] || account.plano_efetivo || "Grátis"}</td><td className="p-3">{formatDate(account.paid_until || account.trial_ends_at)}</td><td className="p-3">{account.usuario_ativo && account.empresa_ativa !== false ? "Ativo" : "Bloqueado"}</td></tr>)}</tbody></table>{accounts.rows.length === 0 && <p className="py-5 text-text-secondary">Nenhuma conta encontrada.</p>}</div>
            )}
          </section>
          <section className="card space-y-4 p-5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 space-y-2 text-sm font-semibold">Buscar empresas
                <input className="input-field w-full" placeholder="Nome ou e-mail" maxLength={200} value={query.search} disabled={operation !== null} onChange={(event) => changeQuery({ search: event.target.value, page: 1 })} />
              </label>
              <button type="button" className="btn-outline-secondary" disabled={list.loading || operation !== null} onClick={() => { setList((previous) => ({ ...previous, loading: true, error: "" })); setRevision((previous) => previous + 1); }}>Atualizar lista</button>
            </div>
            {list.loading ? <p role="status">Consultando empresas…</p> : list.error ? <p role="alert" className="text-primary">{list.error}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Empresas retornadas para a página {query.page}</caption>
                  <thead><tr className="border-b border-border-primary"><th scope="col" className="p-3">Empresa</th><th scope="col" className="p-3">E-mail</th><th scope="col" className="p-3">Plano efetivo</th><th scope="col" className="p-3">Acesso</th><th scope="col" className="p-3">Detalhes</th></tr></thead>
                  <tbody>{list.companies.map((company) => <tr key={company.id} className="border-b border-border-primary"><td className="p-3 font-semibold">{company.nome}</td><td className="break-all p-3">{company.email || "Não informado"}</td><td className="p-3">{planNames[company.plano_efetivo || ""] || company.plano_efetivo || "Não informado"}</td><td className="p-3">{company.ativo ? "Ativo" : "Bloqueado"}</td><td className="p-3"><button type="button" className="btn-outline-secondary" disabled={operation !== null} aria-pressed={selectedId === company.id} aria-label={`Ver detalhes de ${company.nome}`} onClick={() => {
                    setSelectedId(company.id);
                    setChange({ plan: company.plano === "pro" || company.plano === "premium" ? company.plano : "gratis", until: "", discount: "0", reason: "" });
                    setFeedback({ error: "", success: "" });
                  }}>Detalhes</button></td></tr>)}</tbody>
                </table>
                {list.companies.length === 0 && <p className="py-5 text-text-secondary">Nenhuma empresa nesta página. Altere a busca ou volte à página anterior.</p>}
              </div>
            )}
            <nav aria-label="Paginação de empresas" className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn-outline-secondary" disabled={query.page <= 1 || list.loading || operation !== null} onClick={() => changeQuery({ ...query, page: query.page - 1 })}>Anterior</button>
              <span className="text-sm">Página {query.page}</span>
              <button type="button" className="btn-outline-secondary" disabled={list.loading || !!list.error || list.companies.length === 0 || operation !== null} onClick={() => changeQuery({ ...query, page: query.page + 1 })}>Próxima</button>
            </nav>
          </section>
          {selected && !list.loading && (
            <section className="card space-y-5 p-5" aria-label="Detalhes da empresa selecionada">
              <h2 className="text-xl font-bold">{selected.nome}</h2>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-text-secondary">Identificador</dt><dd className="break-all">{selected.id}</dd></div>
                <div><dt className="text-text-secondary">E-mail</dt><dd className="break-all">{selected.email || "Não informado"}</dd></div>
                <div><dt className="text-text-secondary">Plano contratado / efetivo</dt><dd>{planNames[selected.plano || ""] || selected.plano || "Não informado"} / {planNames[selected.plano_efetivo || ""] || selected.plano_efetivo || "Não informado"}</dd></div>
                <div><dt className="text-text-secondary">Acesso</dt><dd>{selected.ativo ? "Ativo" : "Bloqueado"}</dd></div>
                <div><dt className="text-text-secondary">Fim do teste</dt><dd>{formatDate(selected.trial_ends_at)}</dd></div>
                <div><dt className="text-text-secondary">Pago até</dt><dd>{formatDate(selected.paid_until)}</dd></div>
              </dl>
              {superadmin && (
                <form className="space-y-4 border-t border-border-primary pt-5" onSubmit={(event) => { event.preventDefault(); void mutate("plan"); }}>
                  <h3 className="font-bold">Alterar acesso e assinatura</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold">Plano
                      <select className="input-field w-full" value={change.plan} disabled={operation !== null} onChange={(event) => setChange((previous) => ({ ...previous, plan: event.target.value as PlanCode }))}>
                        <option value="gratis">Grátis</option><option value="pro">Pro</option><option value="premium">Premium</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm font-semibold">Acesso pago até (horário local)
                      <input type="datetime-local" className="input-field w-full" value={change.until} disabled={operation !== null || change.plan === "gratis"} required={change.plan !== "gratis"} onChange={(event) => setChange((previous) => ({ ...previous, until: event.target.value }))} />
                    </label>
                  </div>
                  <label className="block space-y-2 text-sm font-semibold">Motivo obrigatório
                    <textarea className="input-field min-h-24 w-full" maxLength={1000} value={change.reason} required disabled={operation !== null} onChange={(event) => setChange((previous) => ({ ...previous, reason: event.target.value }))} />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" className="btn-primary" disabled={operation !== null || !change.reason.trim()}>{operation === "plan" ? "Salvando…" : "Alterar assinatura"}</button>
                    <button type="button" className="btn-cancel" disabled={operation !== null || !change.reason.trim()} onClick={() => void mutate("block")}>{operation === "block" ? "Salvando…" : selected.ativo ? "Bloquear empresa" : "Desbloquear empresa"}</button>
                  </div>
                  <p className="text-sm text-text-secondary">Esta alteração administrativa não realiza cobrança nem estorno.</p>
                </form>
              )}
              {superadmin && (
                <form className="space-y-4 border-t border-border-primary pt-5" onSubmit={(event) => void generateInvoice(event)}>
                  <h3 className="font-bold">Gerar fatura</h3>
                  <p className="text-sm text-text-secondary">Cria um registro administrativo para esta empresa. A cobrança no cartão continua sendo feita pelo provedor configurado.</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="space-y-2 text-sm font-semibold">Plano
                      <select className="input-field w-full" value={change.plan} disabled={operation !== null} onChange={(event) => setChange((previous) => ({ ...previous, plan: event.target.value as PlanCode }))}><option value="gratis">Grátis</option><option value="pro">Pro</option><option value="premium">Premium</option></select>
                    </label>
                    <label className="space-y-2 text-sm font-semibold">Vencimento
                      <input type="datetime-local" className="input-field w-full" value={change.until} disabled={operation !== null} required onChange={(event) => setChange((previous) => ({ ...previous, until: event.target.value }))} />
                    </label>
                    <label className="space-y-2 text-sm font-semibold">Desconto (R$)
                      <input type="text" inputMode="decimal" className="input-field w-full" value={change.discount} disabled={operation !== null} onChange={(event) => setChange((previous) => ({ ...previous, discount: event.target.value.replace(/[^0-9,.]/g, "") }))} />
                    </label>
                  </div>
                  <label className="block space-y-2 text-sm font-semibold">Observação / motivo
                    <textarea className="input-field min-h-20 w-full" maxLength={500} value={change.reason} required disabled={operation !== null} onChange={(event) => setChange((previous) => ({ ...previous, reason: event.target.value }))} />
                  </label>
                  <button type="submit" className="btn-primary" disabled={operation !== null || !change.reason.trim()}>{operation === "invoice" ? "Gerando…" : "Gerar fatura"}</button>
                </form>
              )}
              <section className="space-y-3 border-t border-border-primary pt-5" aria-label="Faturas da empresa">
                <h3 className="font-bold">Faturas desta empresa</h3>
                {invoices.loading ? <p role="status">Consultando faturas…</p> : invoices.error ? <p role="alert" className="text-primary">{invoices.error}</p> : invoices.rows.length === 0 ? <p className="text-sm text-text-secondary">Nenhuma fatura gerada.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border-primary"><th className="p-3">Número</th><th className="p-3">Plano</th><th className="p-3">Valor</th><th className="p-3">Desconto</th><th className="p-3">Vencimento</th><th className="p-3">Status</th></tr></thead><tbody>{invoices.rows.map((invoice) => <tr key={invoice.id} className="border-b border-border-primary"><td className="p-3">#{invoice.numero}</td><td className="p-3">{planNames[invoice.plano] || invoice.plano}</td><td className="p-3">{formatCents(invoice.valor_centavos)}</td><td className="p-3">{formatCents(invoice.desconto_centavos)}</td><td className="p-3">{formatDate(invoice.vencimento)}</td><td className="p-3">{invoice.status}</td></tr>)}</tbody></table></div>}
              </section>
            </section>
          )}
        </>
      )}
    </PageLayout>
  );
}
