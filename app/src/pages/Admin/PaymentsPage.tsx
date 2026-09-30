import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import { Toast, useStatusDialog } from "@/hooks/Dialog";
import PageLayout from "@/layout/PageLayout";
import { salesHistoryService, type CreditSaleDto, type CreditPaymentMethod } from "@/services/api/salesHistoryService";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (cents: number) => currency.format(cents / 100);
const methods: CreditPaymentMethod[] = ["dinheiro", "pix", "debito", "credito"];
const labels: Record<CreditPaymentMethod, string> = { dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Crédito" };
const emptyAmounts = () => ({ dinheiro: "", pix: "", debito: "", credito: "" });
function parseAmount(value: string) {
  if (!value.trim()) return 0;
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(value.trim())) return NaN;
  return Math.round(Number(value.trim().replace(",", ".")) * 100);
}
function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleString("pt-BR");
}

export default function PaymentsPage() {
  const [sales, setSales] = useState<CreditSaleDto[]>([]);
  const [selected, setSelected] = useState<CreditSaleDto | null>(null);
  const [quantities, setQuantities] = useState<string[]>([]);
  const [amounts, setAmounts] = useState(emptyAmounts);
  const [search, setSearch] = useState("");
  const [showPaid, setShowPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guard = useRef(false);
  const requestId = useRef("");
  const dialog = useStatusDialog();

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setSales(await salesHistoryService.listCreditSales()); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar os fiados."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = (sale: CreditSaleDto) => {
    setSelected(sale); setQuantities(sale.items.map((item) => String(item.quantity)));
    setAmounts(emptyAmounts()); requestId.current = ""; setError("");
  };
  const apply = (sale: CreditSaleDto) => {
    setSales((current) => current.map((entry) => entry.id === sale.id ? sale : entry));
    open(sale);
  };
  const filtered = sales.filter((sale) => (showPaid || sale.openCents > 0) && `${sale.customerName} ${sale.customerCpf} ${sale.saleNumber}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  const openSales = sales.filter((sale) => sale.openCents > 0);
  const customerCount = new Set(openSales.map((sale) => `${sale.customerName.trim().toLocaleLowerCase("pt-BR")}:${sale.customerCpf}`)).size;
  const quantityValues = quantities.map((q) => q.trim() ? Number(q.replace(",", ".")) : NaN);
  const validQuantities = quantityValues.every((q) => Number.isFinite(q) && q >= 0) && quantityValues.some((q) => q > 0);
  const dirty = !!selected && selected.items.some((item, i) => item.quantity !== quantityValues[i]);
  const previewTotal = selected ? selected.items.reduce((sum, item, i) => sum + Math.round(item.unitPrice * quantityValues[i] * 100), 0) - selected.discountCents : 0;
  const quantityError = !validQuantities ? "Informe quantidades válidas; mantenha pelo menos um produto." : previewTotal <= 0 || (selected && previewTotal < selected.paidCents) ? "O total deve ser positivo e não pode ficar abaixo do valor já recebido." : "";
  const paymentValues = methods.map((forma) => ({ forma, amountCents: parseAmount(amounts[forma]) }));
  const paymentTotal = paymentValues.reduce((sum, p) => sum + p.amountCents, 0);
  const validPayment = paymentValues.every((p) => Number.isSafeInteger(p.amountCents) && p.amountCents >= 0) && paymentTotal > 0 && !!selected && paymentTotal <= selected.openCents;

  async function saveQuantities() {
    if (!selected || guard.current || !dirty || quantityError) return;
    guard.current = true; setBusy(true);
    try {
      const confirmed = await dialog.confirm(`Salvar as quantidades da venda #${selected.saleNumber}? Novo total: ${money(previewTotal)}. Já recebido: ${money(selected.paidCents)}.`, { confirmLabel: "Salvar quantidades", cancelLabel: "Cancelar" });
      if (!confirmed) return;
      apply(await salesHistoryService.updateCreditQuantities({ saleId: selected.id, revision: selected.revision, quantities: quantityValues }));
      Toast.success("Quantidades salvas. Pagamentos anteriores preservados.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar as quantidades."); }
    finally { guard.current = false; setBusy(false); }
  }

  async function receive() {
    if (!selected || guard.current || dirty || !validPayment) return;
    guard.current = true; setBusy(true);
    try {
      const payments = paymentValues.filter((p) => p.amountCents > 0);
      const confirmed = await dialog.confirm(`Registrar ${money(paymentTotal)} na venda #${selected.saleNumber}? ${payments.map((p) => `${labels[p.forma]}: ${money(p.amountCents)}`).join(" + ")}. Restará ${money(selected.openCents - paymentTotal)}. Confirme somente após receber.`, { confirmLabel: "Confirmar recebimento", cancelLabel: "Cancelar", confirmIntent: "success" });
      if (!confirmed) return;
      if (!requestId.current) requestId.current = crypto.randomUUID();
      apply(await salesHistoryService.receiveCreditPayment({ saleId: selected.id, revision: selected.revision, requestId: requestId.current, payments }));
      Toast.success("Recebimento registrado. Saldo atualizado.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar o recebimento."); }
    finally { guard.current = false; setBusy(false); }
  }

  return <PageLayout className="space-y-5 py-5">
    <PageHeader title="Pagamentos e Fiado" description="Abra uma venda, ajuste os produtos e receba uma parte ou todo o saldo. Dados disponíveis para toda a empresa." />
    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-danger">{error} <button type="button" className="underline" disabled={busy} onClick={() => { setSelected(null); void load(); }}>Voltar e atualizar dados</button></p>}
    {!selected ? <>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4"><p>Clientes devendo</p><strong className="text-2xl">{customerCount}</strong></div>
        <div className="card p-4"><p>Total em aberto</p><strong className="text-2xl text-danger">{money(openSales.reduce((sum, s) => sum + s.openCents, 0))}</strong></div>
      </section>
      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Buscar fiados" className="input-field min-w-0 flex-1" placeholder="Cliente, documento ou número da venda" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} />Incluir quitados</label>
          <button type="button" className="btn-outline-secondary" disabled={loading} onClick={() => void load()}>Atualizar</button>
        </div>
        {loading ? <p role="status">Carregando fiados…</p> : !error && filtered.length === 0 ? <p>Nenhuma venda encontrada neste filtro.</p> : filtered.map((sale) => <article key={sale.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-border-primary p-4">
          <div className="min-w-0 flex-1 break-words"><h2 className="font-semibold">{sale.customerName}</h2><p className="text-xs text-text-secondary">{sale.customerCpf || "Sem documento"} · Venda #{sale.saleNumber}</p><p className="text-xs text-text-secondary">{when(sale.saleDate)} · {sale.items.length} produto(s)</p></div>
          <div className="text-sm"><p>Total: {money(sale.totalCents)}</p><p>Recebido: {money(sale.paidCents)}</p><strong className={sale.openCents > 0 ? "text-danger" : "text-success"}>{sale.openCents > 0 ? `Em aberto: ${money(sale.openCents)}` : "Quitado"}</strong></div>
          <button type="button" className="btn-primary" onClick={() => open(sale)}>Abrir / Receber</button>
        </article>)}
      </section>
    </> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Venda #{selected.saleNumber} · {selected.customerName}</h2><button type="button" disabled={busy} className="btn-outline-secondary" onClick={() => { setSelected(null); setError(""); }}>Voltar à lista</button></div>
      <div className="grid gap-3 sm:grid-cols-3">{[["Total da venda", selected.totalCents], ["Já recebido", selected.paidCents], ["Saldo em aberto", selected.openCents]].map(([label, value]) => <div key={label} className="card p-4"><p>{label}</p><strong className="text-xl">{money(Number(value))}</strong></div>)}</div>
      <section className="card space-y-4 p-4">
        <h3 className="font-semibold">Produtos e quantidades</h3>
        <p className="text-sm text-text-secondary">Preços e desconto são preservados. Quantidade zero remove o item ao salvar. Esse ajuste altera a venda, não movimenta estoque nem registra devolução de dinheiro.</p>
        {selected.items.map((item, i) => <div key={`${item.productId}-${i}`} className="flex flex-wrap items-center gap-4 border-b border-border-primary pb-3">
          <div className="min-w-0 flex-1 break-words"><p className="font-medium">{item.productName}</p><p className="text-xs text-text-secondary">Cód. {item.productCode} · Unitário: {money(Math.round(item.unitPrice * 100))}</p></div>
          <label className="text-sm">Quantidade<input aria-label={`Quantidade de ${item.productName}`} className="input-field ml-2 w-24" inputMode="decimal" value={quantities[i]} disabled={busy} onChange={(e) => setQuantities((values) => values.map((q, index) => index === i ? e.target.value : q))} /></label>
          <strong>{Number.isFinite(quantityValues[i]) ? money(Math.round(item.unitPrice * quantityValues[i] * 100)) : "—"}</strong>
        </div>)}
        <p>Desconto preservado: {money(selected.discountCents)} · Novo total: {Number.isFinite(previewTotal) ? money(previewTotal) : "—"}</p>
        {dirty && quantityError && <p role="alert" className="text-danger">{quantityError}</p>}
        <button type="button" className="btn-primary" disabled={busy || !dirty || !!quantityError} onClick={() => void saveQuantities()}>Salvar quantidades</button>
      </section>
      <section className="card space-y-4 p-4">
        <h3 className="font-semibold">Receber agora</h3>
        <p className="text-sm text-text-secondary">Digite apenas o valor recebido em cada forma, sem separador de milhar (ex.: 40,00). Pode combinar formas. Isso registra o recebimento; não faz cobrança automática no banco ou na maquininha.</p>
        {dirty && <p role="alert" className="text-danger">Salve as quantidades antes de registrar o pagamento.</p>}
        {selected.openCents === 0 ? <p className="font-semibold text-success">Esta venda está quitada. Os comprovantes de registro permanecem abaixo.</p> : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{methods.map((method) => <label key={method} className="text-sm">{labels[method]}<input className="input-field mt-1 w-full" aria-label={`Valor em ${labels[method]}`} inputMode="decimal" placeholder="0,00" disabled={busy || dirty} value={amounts[method]} onChange={(e) => { setAmounts((current) => ({ ...current, [method]: e.target.value })); requestId.current = ""; }} /></label>)}</div>
          <p>Recebendo: {Number.isFinite(paymentTotal) ? money(paymentTotal) : "Valor inválido"} · Saldo após pagamento: {validPayment ? money(selected.openCents - paymentTotal) : "—"}</p>
          {!validPayment && methods.some((m) => amounts[m]) && <p role="alert" className="text-danger">Informe valores positivos, com até duas casas decimais, sem ultrapassar o saldo em aberto.</p>}
          <button type="button" className="btn-primary" disabled={busy || dirty || !validPayment} onClick={() => void receive()}>{busy ? "Aguarde…" : "Confirmar pagamento"}</button>
        </>}
      </section>
      <section className="card space-y-3 p-4"><h3 className="font-semibold">Histórico de recebimentos</h3>
        {selected.initialPaidCents > 0 && <p>Recebido na venda original: {money(selected.initialPaidCents)}</p>}
        {selected.legacyPaidCents > 0 && <p>Quitação registrada na versão anterior: {money(selected.legacyPaidCents)}{selected.legacyPaidAt ? ` · ${when(selected.legacyPaidAt)}` : ""}. Forma não informada.</p>}
        {selected.receipts.map((receipt) => <article key={receipt.id} className="rounded-lg border border-border-primary p-3"><p className="font-medium">{when(receipt.paidAt)} · {receipt.operatorName}</p><p>{receipt.payments.map((p) => `${labels[p.forma]}: ${money(p.amountCents)}`).join(" + ")}</p><p className="break-all text-xs text-text-secondary">Registro: {receipt.id}</p></article>)}
        {!selected.receipts.length && !selected.legacyPaidCents && !selected.initialPaidCents && <p>Nenhum pagamento recebido ainda.</p>}
      </section>
    </>}
    {dialog.Dialog}
  </PageLayout>;
}
