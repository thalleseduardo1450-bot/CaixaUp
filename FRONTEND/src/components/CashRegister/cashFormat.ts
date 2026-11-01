/**
 * Arquivo: src/components/CashRegister/cashFormat.ts
 * Objetivo: textos de data, tempo e dinheiro usados na tela de caixa.
 */
import { formatCents } from "@/utils/pdvMoney";

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "01/11 às 08:12" */
export function formatShortDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} às ${time}`;
}

/** "30/10 23:15" */
export function formatDayTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

export function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function minutesBetween(fromIso: string, nowMs: number) {
  const time = new Date(fromIso).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((nowMs - time) / 60000));
}

export function formatElapsed(minutes: number) {
  if (minutes < 1) return "menos de 1 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return `${hours}h ${String(rest).padStart(2, "0")}min`;
}

export function brl(cents: number) {
  return `R$ ${formatCents(cents)}`;
}

/** Sobra / falta / confere, com o sinal escrito por extenso. */
export function describeDifference(differenceCents: number) {
  if (differenceCents === 0) return { tone: "ok" as const, label: "Confere", value: brl(0) };
  if (differenceCents > 0) return { tone: "over" as const, label: "Sobra", value: brl(differenceCents) };
  return { tone: "short" as const, label: "Falta", value: brl(-differenceCents) };
}
