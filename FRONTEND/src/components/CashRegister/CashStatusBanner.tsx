/**
 * Arquivo: src/components/CashRegister/CashStatusBanner.tsx
 * Objetivo: faixa do topo da tela de caixa — diz em uma linha se dá para vender agora.
 */
import { CircleAlert, LockKeyhole, UnlockKeyhole } from "lucide-react";
import type { CashRegisterSessionDto } from "@/services/api/cashRegisterService";
import { brl, formatElapsed, formatShortDateTime } from "./cashFormat";

type CashStatusBannerProps = {
  state: "aberto" | "expirado" | "fechado";
  session: CashRegisterSessionDto | null;
  lastSession: CashRegisterSessionDto | null;
  elapsedMinutes: number;
  soldCents: number | null;
  salesCount: number | null;
  expectedCashCents: number | null;
};

const TONES = {
  aberto: {
    box: "border-success/35 bg-success/[0.07]",
    icon: "bg-success text-white",
    eyebrow: "text-success",
  },
  expirado: {
    box: "border-primary/40 bg-primary/[0.07]",
    icon: "bg-primary text-white",
    eyebrow: "text-primary",
  },
  fechado: {
    box: "border-border-secondary bg-bg-light",
    icon: "bg-bg-gray-theme text-text-secondary",
    eyebrow: "text-text-secondary",
  },
};

export default function CashStatusBanner({
  state,
  session,
  lastSession,
  elapsedMinutes,
  soldCents,
  salesCount,
  expectedCashCents,
}: CashStatusBannerProps) {
  const tone = TONES[state];
  const Icon = state === "aberto" ? UnlockKeyhole : state === "expirado" ? CircleAlert : LockKeyhole;

  const eyebrow =
    state === "aberto"
      ? "Caixa aberto · vendas liberadas"
      : state === "expirado"
        ? "Caixa vencido · vendas bloqueadas"
        : "Caixa fechado · vendas bloqueadas";

  const title =
    state === "aberto"
      ? elapsedMinutes < 1
        ? "Aberto agora"
        : `Aberto há ${formatElapsed(elapsedMinutes)}`
      : state === "expirado"
        ? "Feche este caixa para voltar a vender."
        : "Abra o caixa para começar a vender.";

  const details: string[] = [];
  if (session) {
    if (state === "expirado") details.push(`Aberto há ${formatElapsed(elapsedMinutes)} (mais de 24 horas)`);
    details.push(`Desde ${formatShortDateTime(session.openedAt)}`);
    if (session.operatorName) details.push(`Operador ${session.operatorName}`);
    if (state === "aberto" && session.expiresAt) {
      details.push(`Fechar até ${formatShortDateTime(session.expiresAt)}`);
    }
  } else if (lastSession) {
    details.push(`Último fechamento em ${formatShortDateTime(lastSession.closedAt)}`);
    if (lastSession.operatorName) details.push(lastSession.operatorName);
  } else {
    details.push("Nenhum caixa registrado ainda.");
  }

  return (
    <section
      className={`card flex flex-col gap-4 border-2 p-4 md:flex-row md:items-center md:justify-between md:p-5 ${tone.box}`}
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-4">
        <span className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tone.icon}`}>
          <Icon size={28} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-wider ${tone.eyebrow}`}>{eyebrow}</p>
          <h2 className="mt-0.5 text-2xl font-bold leading-tight text-text-primary">{title}</h2>
          <p className="mt-1 text-sm text-text-secondary">{details.join(" · ")}</p>
        </div>
      </div>

      {session && soldCents !== null ? (
        <dl className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-xl border border-border-primary bg-bg-light px-4 py-2.5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Vendido no turno</dt>
            <dd className="mt-0.5 text-xl font-bold tabular-nums text-text-primary">{brl(soldCents)}</dd>
            <dd className="text-xs text-text-secondary">
              {salesCount === 1 ? "1 venda" : `${salesCount ?? 0} vendas`}
            </dd>
          </div>
          <div className="rounded-xl border border-border-primary bg-bg-light px-4 py-2.5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Dinheiro na gaveta</dt>
            <dd className="mt-0.5 text-xl font-bold tabular-nums text-text-primary">
              {brl(expectedCashCents ?? 0)}
            </dd>
            <dd className="text-xs text-text-secondary">esperado agora</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
