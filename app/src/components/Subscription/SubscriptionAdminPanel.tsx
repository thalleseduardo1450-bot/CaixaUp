/**
 * Arquivo: src/components/Subscription/SubscriptionAdminPanel.tsx
 * Objetivo: administração libera ou troca o plano de uma conta pelo e-mail.
 *
 * Só aparece para quem a API reconhece como administrador da plataforma: para
 * os demais a consulta responde 403 e o painel não é mostrado. Toda troca vai
 * para a auditoria com o motivo e quem fez.
 */
import { useEffect, useState, type FormEvent } from "react";
import { subscriptionService, type AdminSubscriptionRow } from "@/services/api/subscriptionService";

const planNames: Record<string, string> = { gratis: "Grátis", pro: "Pro", premium: "Premium" };
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

export default function SubscriptionAdminPanel() {
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState<AdminSubscriptionRow[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ email: "", plan: "premium" as "gratis" | "pro" | "premium", months: 12, reason: "" });
  const [status, setStatus] = useState({ busy: false, error: "", success: "" });

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      subscriptionService.listForAdmin(search)
        .then((result) => { if (active) { setAllowed(true); setRows(result); } })
        .catch(() => undefined);
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, status.success]);

  if (!allowed) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status.busy) return;
    setStatus({ busy: true, error: "", success: "" });
    try {
      const saved = await subscriptionService.change(form);
      const until = saved.paidUntil ? ` até ${dateFormat.format(new Date(saved.paidUntil))}` : "";
      setStatus({ busy: false, error: "", success: `${saved.companyName}: plano ${planNames[saved.plan ?? "gratis"]}${until}.` });
      setForm((previous) => ({ ...previous, reason: "" }));
    } catch (error) {
      setStatus({ busy: false, error: error instanceof Error ? error.message : "Não foi possível trocar o plano.", success: "" });
    }
  }

  return (
    <section className="card mt-6 space-y-4 p-5" aria-label="Administração de assinaturas">
      <div>
        <h2 className="text-xl font-bold">Administração de assinaturas</h2>
        <p className="text-sm text-text-secondary">Libera ou troca o plano de uma conta pelo e-mail. A troca vale na hora e fica registrada na auditoria.</p>
      </div>

      <form className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          E-mail da conta
          <input type="email" required className="input-field" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Plano
          <select className="input-field" value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value as typeof form.plan })}>
            <option value="premium">Premium</option>
            <option value="pro">Pro</option>
            <option value="gratis">Grátis (remove o plano pago)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Meses
          <select className="input-field" value={form.months} disabled={form.plan === "gratis"} onChange={(event) => setForm({ ...form, months: Number(event.target.value) })}>
            <option value={1}>1 mês</option>
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses (anual)</option>
            <option value={24}>24 meses</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold md:col-span-2">
          Motivo
          <input required minLength={5} maxLength={500} className="input-field" placeholder="Ex.: Plano anual pago via Pix" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        </label>
        <button type="submit" className="btn-primary self-end" disabled={status.busy}>{status.busy ? "Salvando..." : "Aplicar plano"}</button>
      </form>
      {status.error && <p role="alert" className="text-sm font-semibold text-primary">{status.error}</p>}
      {status.success && <p role="status" className="text-sm font-semibold text-success">{status.success}</p>}

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Buscar conta
        <input className="input-field" placeholder="Nome da empresa ou e-mail" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border-primary"><th className="p-2">Empresa</th><th className="p-2">E-mail</th><th className="p-2">Plano na API</th><th className="p-2">Vence em</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.companyId} className="border-b border-border-primary">
                <td className="p-2 font-semibold">{row.companyName}</td>
                <td className="break-all p-2">{row.email || "-"}</td>
                <td className="p-2">{row.plan ? planNames[row.plan] : "Sem plano pago (vale o do Supabase)"}</td>
                <td className="p-2">{row.paidUntil && row.plan ? dateFormat.format(new Date(row.paidUntil)) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-4 text-text-secondary">Nenhuma conta encontrada.</p>}
      </div>
    </section>
  );
}
