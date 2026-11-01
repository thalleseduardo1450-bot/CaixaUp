/**
 * Arquivo: src/components/CashRegister/CashClosePanel.tsx
 * Objetivo: fechar o caixa com a conferência da gaveta — mostra quanto deveria
 * ter em dinheiro, o operador digita quanto contou e vê na hora se sobra ou falta.
 */
import { LockKeyhole } from "lucide-react";
import LoadingButton from "@/components/Loading/LoadingButton";
import type { CashSessionSummary } from "@/services/api/cashRegisterService";
import { parseCentsBr } from "@/utils/pdvMoney";
import CashMoneyInput from "./CashMoneyInput";
import { brl, describeDifference } from "./cashFormat";

type CashClosePanelProps = {
  summary: CashSessionSummary | null;
  openingCents: number;
  counted: string;
  onCountedChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
  saving: boolean;
  expired: boolean;
};

const DIFF_TONES = {
  ok: "border-success/30 bg-success/10 text-success",
  over: "border-accent/30 bg-accent/10 text-accent",
  short: "border-primary/30 bg-primary/10 text-primary",
};

export default function CashClosePanel({
  summary,
  openingCents,
  counted,
  onCountedChange,
  note,
  onNoteChange,
  onSubmit,
  saving,
  expired,
}: CashClosePanelProps) {
  const expected = summary?.expectedCashCents ?? null;
  const hasCount = counted.trim() !== "";
  const difference = hasCount && expected !== null ? describeDifference(parseCentsBr(counted) - expected) : null;

  const rows = [
    { label: "Fundo de troco", value: brl(summary?.openingCents ?? openingCents), sign: "" },
    { label: "Vendas em dinheiro", value: brl(summary?.cashSalesCents ?? 0), sign: "+" },
    { label: "Suprimentos", value: brl(summary?.suprimentoCents ?? 0), sign: "+" },
    { label: "Sangrias", value: brl(summary?.sangriaCents ?? 0), sign: "−" },
  ];

  return (
    <section className="card p-4 md:p-5" aria-labelledby="cash-close-title">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
            expired ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
          }`}
        >
          <LockKeyhole size={18} aria-hidden="true" />
        </span>
        <h2 id="cash-close-title" className="text-lg font-bold text-text-primary">
          {expired ? "Fechar caixa vencido" : "Fechar caixa"}
        </h2>
      </div>

      <div className="mt-3 rounded-xl border border-border-primary bg-bg-primary px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Dinheiro na gaveta</p>
        <dl className="mt-1 space-y-0.5 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3">
              <dt className="text-text-secondary">
                <span className="inline-block w-3 text-text-tertiary">{row.sign}</span>
                {row.label}
              </dt>
              <dd className="tabular-nums text-text-primary">{row.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-border-primary pt-1.5 text-base">
            <dt className="font-bold text-text-primary">Esperado</dt>
            <dd className="font-bold tabular-nums text-text-primary">
              {expected === null ? "calculando..." : brl(expected)}
            </dd>
          </div>
        </dl>
      </div>

      <label htmlFor="cash-counted-amount" className="mb-1.5 mt-4 block text-sm font-semibold text-text-primary">
        Dinheiro contado na gaveta
      </label>
      <CashMoneyInput
        id="cash-counted-amount"
        value={counted}
        onChange={onCountedChange}
        onEnter={onSubmit}
        ariaDescribedBy="cash-counted-hint"
      />

      <div className="mt-2 min-h-10" id="cash-counted-hint">
        {difference ? (
          <div
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-bold ${DIFF_TONES[difference.tone]}`}
            role="status"
          >
            <span>{difference.tone === "ok" ? "Confere com o esperado" : `${difference.label} na gaveta`}</span>
            <span className="tabular-nums">{difference.tone === "ok" ? "✓" : difference.value}</span>
          </div>
        ) : (
          <p className="py-2 text-sm text-text-secondary">Conte notas e moedas e digite o total. Sem nada, digite 0.</p>
        )}
      </div>

      <label htmlFor="cash-closing-note" className="mt-1 block text-sm font-semibold text-text-primary">
        Observação <span className="font-normal text-text-tertiary">(opcional)</span>
      </label>
      <input
        id="cash-closing-note"
        value={note}
        maxLength={300}
        onChange={(event) => onNoteChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit();
        }}
        className="input-field mt-1.5 w-full"
        placeholder={difference && difference.tone !== "ok" ? "Explique a diferença" : "Ex.: conferido com o gerente"}
      />

      <LoadingButton
        type="button"
        onClick={onSubmit}
        isLoading={saving}
        loadingLabel="Fechando..."
        className={`${expired ? "btn-cancel" : "btn-primary"} mt-4 inline-flex w-full items-center justify-center gap-2 text-lg`}
      >
        <LockKeyhole size={18} aria-hidden="true" />
        Fechar caixa
      </LoadingButton>
    </section>
  );
}
