/**
 * Arquivo: src/components/CashRegister/CashTurnSummary.tsx
 * Objetivo: o que entrou no turno — total vendido, divisão por forma de pagamento
 * e as sangrias/suprimentos, com os botões para registrar um novo.
 */
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CreditCard,
  FileText,
  HandCoins,
  Landmark,
  MoreHorizontal,
  QrCode,
  type LucideIcon,
} from "lucide-react";
import Skeleton from "@/components/Loading/Skeleton";
import type { CashSessionSummary } from "@/services/api/cashRegisterService";
import { brl, formatShortDateTime, formatTime } from "./cashFormat";

const PAYMENT_ICONS: Record<string, LucideIcon> = {
  dinheiro: Banknote,
  pix: QrCode,
  debito: Landmark,
  credito: CreditCard,
  fiado: HandCoins,
  cheque: FileText,
};

type CashTurnSummaryProps = {
  title: string;
  subtitle: string;
  summary: CashSessionSummary | null;
  loading: boolean;
  error: string;
  /** Só com o caixa aberto dá para registrar sangria/suprimento. */
  canMove: boolean;
  onMove?: (type: "sangria" | "suprimento") => void;
};

export default function CashTurnSummary({
  title,
  subtitle,
  summary,
  loading,
  error,
  canMove,
  onMove,
}: CashTurnSummaryProps) {
  const soldCents = summary?.soldCents ?? 0;
  const salesCount = summary?.salesCount ?? 0;
  const ticketCents = salesCount > 0 ? Math.round(soldCents / salesCount) : 0;
  const receivedCents = soldCents - (summary?.fiadoCents ?? 0);

  return (
    <article className="card p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          <p className="text-sm text-text-secondary">{subtitle}</p>
        </div>
        {summary && summary.canceledCount > 0 ? (
          <span className="rounded-full bg-bg-gray-theme px-2.5 py-1 text-xs font-semibold text-text-secondary">
            {summary.canceledCount} cancelada{summary.canceledCount > 1 ? "s" : ""} fora da conta
          </span>
        ) : null}
      </header>

      {error ? (
        <p className="mt-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">{error}</p>
      ) : null}

      <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: "Vendido", value: brl(soldCents), hint: salesCount === 1 ? "1 venda" : `${salesCount} vendas` },
          { label: "Recebido", value: brl(receivedCents), hint: "sem o fiado" },
          { label: "Ticket médio", value: brl(ticketCents), hint: "por venda" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl bg-bg-gray-theme/70 px-3 py-2.5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{kpi.label}</dt>
            <dd className="mt-0.5 truncate text-lg font-bold tabular-nums text-text-primary">
              {loading && !summary ? <Skeleton className="h-6 w-24" /> : kpi.value}
            </dd>
            <dd className="text-xs text-text-secondary">{kpi.hint}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-text-tertiary">Por forma de pagamento</h3>
      <ul className="mt-2 divide-y divide-border-primary">
        {(summary?.byPayment ?? []).map((payment) => {
          const Icon = PAYMENT_ICONS[payment.method] ?? MoreHorizontal;
          const share = soldCents > 0 ? Math.min(100, Math.round((payment.cents / soldCents) * 100)) : 0;
          return (
            <li key={payment.method} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-x-4 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <Icon size={17} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="font-medium text-text-primary">{payment.label}</span>
                  <span className="text-xs text-text-tertiary">
                    {payment.count > 0 ? `${payment.count} venda${payment.count > 1 ? "s" : ""}` : ""}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-gray-theme" aria-hidden="true">
                  <div className="h-full rounded-full bg-accent/70" style={{ width: `${share}%` }} />
                </div>
              </div>
              <strong className="text-right text-base tabular-nums text-text-primary">{brl(payment.cents)}</strong>
            </li>
          );
        })}
        {!summary && loading ? (
          <li className="space-y-2 py-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </li>
        ) : null}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Sangrias e suprimentos</h3>
        {canMove && onMove ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onMove("sangria")}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-secondary px-3 text-sm font-semibold text-text-primary transition hover:bg-hover-light"
            >
              <ArrowUpFromLine size={16} className="text-primary" aria-hidden="true" />
              Sangria
            </button>
            <button
              type="button"
              onClick={() => onMove("suprimento")}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-secondary px-3 text-sm font-semibold text-text-primary transition hover:bg-hover-light"
            >
              <ArrowDownToLine size={16} className="text-success" aria-hidden="true" />
              Suprimento
            </button>
          </div>
        ) : null}
      </div>
      {summary && !summary.movementsAvailable ? (
        <p className="mt-2 text-sm text-primary">Não foi possível carregar as sangrias e suprimentos agora.</p>
      ) : summary && summary.movements.length > 0 ? (
        <ul className="mt-2 divide-y divide-border-primary rounded-xl border border-border-primary">
          {summary.movements.map((movement) => {
            const isOut = movement.type === "sangria";
            return (
              <li key={movement.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                {isOut ? (
                  <ArrowUpFromLine size={16} className="shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <ArrowDownToLine size={16} className="shrink-0 text-success" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text-primary">
                    {isOut ? "Sangria" : "Suprimento"}
                    {movement.reason ? <span className="font-normal text-text-secondary"> · {movement.reason}</span> : null}
                  </p>
                  <p className="text-xs text-text-tertiary" title={formatShortDateTime(movement.createdAt)}>
                    {formatTime(movement.createdAt)}
                    {movement.operatorName ? ` · ${movement.operatorName}` : ""}
                  </p>
                </div>
                <strong className={`tabular-nums ${isOut ? "text-primary" : "text-success"}`}>
                  {isOut ? "−" : "+"} {brl(movement.cents)}
                </strong>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-secondary">
          {canMove
            ? "Tirou dinheiro da gaveta (sangria) ou colocou troco (suprimento)? Registre aqui para a conta do fechamento bater."
            : "Nenhuma sangria ou suprimento neste turno."}
        </p>
      )}
    </article>
  );
}
