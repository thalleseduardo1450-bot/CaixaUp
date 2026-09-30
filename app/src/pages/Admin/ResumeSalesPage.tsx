import { useCallback, useEffect, useState } from "react";
import { PauseCircle, Play, RefreshCw, Trash2 } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import PageLayout from "@/layout/PageLayout";
import { suspendedSalesService } from "@/services/api/suspendedSalesService";
import type { PdvSuspendedSale } from "@/types/pdv";
import { saveDraft } from "@/utils/pdvDrafts";
import { formatCentsBrl } from "@/utils/pdvMoney";
import type { PageKey } from "@/components/AppSidebar/AppSidebar";

type Props = { onNavigate: (page: PageKey) => void };

function when(timestamp: number) {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "Data não informada";
}

export default function ResumeSalesPage({ onNavigate }: Props) {
  const [sales, setSales] = useState<PdvSuspendedSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setSales(await suspendedSalesService.list()); }
    catch { setError("Não foi possível acessar as vendas salvas da empresa."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function resume(id: string) {
    setBusyId(id); setError("");
    try {
      const sale = await suspendedSalesService.resume(id);
      if (!saveDraft(sale.items, sale.customerId, sale.id, sale.claimToken)) throw new Error("storage");
      onNavigate("vendas");
    } catch { setError("Não foi possível retomar a venda salva neste computador."); }
    finally { setBusyId(""); }
  }

  async function discard(id: string) {
    if (!window.confirm("Descartar esta venda suspensa? Ela não poderá ser retomada.")) return;
    setBusyId(id); setError("");
    try { await suspendedSalesService.discard(id); await load(); }
    catch { setError("Não foi possível descartar a venda. Tente novamente."); }
    finally { setBusyId(""); }
  }

  return <PageLayout>
    <PageHeader title="Retomar vendas" description="Vendas suspensas ficam salvas somente neste computador, para este operador."
      action={<button type="button" className="btn-outline-secondary" onClick={() => void load()} disabled={loading || !!busyId}><RefreshCw size={16} className="mr-2 inline" />Atualizar</button>} />
    {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-danger">{error}</p>}
    {loading ? <p role="status" className="text-text-secondary">Buscando vendas salvas da empresa…</p> : sales.length === 0 ? <section className="card py-16 text-center"><PauseCircle className="mx-auto text-accent" size={36} /><h2 className="mt-4 text-xl font-bold">Nenhuma venda suspensa</h2><p className="mt-2 text-text-secondary">No PDV, use F7 para guardar uma venda e atendê-la depois.</p></section> : <section className="card divide-y divide-border-primary">{sales.map((sale) => <article key={sale.id} className="flex flex-wrap items-center gap-4 p-5"><div className="min-w-0 flex-1"><h2 className="truncate text-lg font-bold">{sale.label}</h2><p className="text-sm text-text-secondary">{when(sale.suspendedAt)} · {sale.itemCount ?? sale.items.length} item(ns){sale.customerName ? ` · ${sale.customerName}` : ""}</p></div><strong className="font-mono text-xl">{formatCentsBrl(sale.totalCents)}</strong><button type="button" className="btn-outline-secondary" disabled={!!busyId} onClick={() => void discard(sale.id)}><Trash2 size={16} className="mr-2 inline" />Descartar</button><button type="button" className="btn-primary" disabled={!!busyId} onClick={() => void resume(sale.id)}><Play size={16} className="mr-2 inline" />{busyId === sale.id ? "Abrindo…" : "Retomar"}</button></article>)}</section>}
  </PageLayout>;
}
