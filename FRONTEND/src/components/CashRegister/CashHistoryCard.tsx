/**
 * Arquivo: src/components/CashRegister/CashHistoryCard.tsx
 * Objetivo: histórico dos caixas da empresa (guardado no Supabase), com a
 * conferência de cada fechamento e a reimpressão do resumo.
 */
import { Printer } from "lucide-react";
import { useMemo, useState } from "react";
import TablePagination from "@/components/Pagination/TablePagination";
import type { CashRegisterSessionDto } from "@/services/api/cashRegisterService";
import { brl, describeDifference, formatDateTime, formatDayTime, formatTime } from "./cashFormat";

type CashHistoryCardProps = {
  sessions: CashRegisterSessionDto[];
  loading: boolean;
  error: string;
  printingId: string | null;
  onPrint: (session: CashRegisterSessionDto) => void;
};

function sameDay(a: string, b: string) {
  const first = new Date(a);
  const second = new Date(b);
  return first.toDateString() === second.toDateString();
}

const DIFF_CLASS = {
  ok: "text-success",
  over: "text-accent",
  short: "text-primary",
};

export default function CashHistoryCard({ sessions, loading, error, printingId, onPrint }: CashHistoryCardProps) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const totalPages = Math.max(1, Math.ceil(sessions.length / perPage));
  const safePage = Math.min(page, totalPages);
  const rows = useMemo(
    () => sessions.slice((safePage - 1) * perPage, safePage * perPage),
    [perPage, safePage, sessions],
  );

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border-primary px-4 py-3 md:px-5">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Histórico de caixas</h2>
          <p className="text-sm text-text-secondary">Aberturas e fechamentos salvos na nuvem, do mais recente para o mais antigo.</p>
        </div>
      </header>

      {error ? <p className="px-5 py-4 text-sm text-primary">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] whitespace-nowrap text-sm">
          <thead className="bg-bg-gray-theme text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-3 py-2 text-left">Situação</th>
              <th className="px-3 py-2 text-left">Período</th>
              <th className="hidden px-3 py-2 text-left xl:table-cell">Operador</th>
              <th className="hidden px-3 py-2 text-right xl:table-cell">Inicial</th>
              <th className="px-3 py-2 text-right">Vendido</th>
              <th className="px-3 py-2 text-right">Esperado</th>
              <th className="px-3 py-2 text-right">Contado</th>
              <th className="px-3 py-2 text-right">Diferença</th>
              <th className="w-10 px-2 py-2" aria-label="Imprimir" />
            </tr>
          </thead>
          <tbody>
            {rows.map((session) => {
              const isOpen = session.status === "aberto";
              const difference =
                session.countedCents !== null && session.expectedCents !== null
                  ? describeDifference(session.countedCents - session.expectedCents)
                  : null;
              const closedSameDay = session.closedAt && sameDay(session.openedAt, session.closedAt);
              return (
                <tr key={session.id} className="border-b border-border-primary last:border-b-0">
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        isOpen ? "bg-success/15 text-success" : "bg-bg-gray-theme text-text-secondary"
                      }`}
                    >
                      {isOpen ? "Aberto" : "Fechado"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-text-primary">
                    <span title={`${formatDateTime(session.openedAt)} até ${session.closedAt ? formatDateTime(session.closedAt) : "agora"}`}>
                      {formatDayTime(session.openedAt)}
                      <span className="text-text-tertiary">
                        {" → "}
                        {session.closedAt
                          ? closedSameDay
                            ? formatTime(session.closedAt)
                            : formatDayTime(session.closedAt)
                          : "agora"}
                      </span>
                    </span>
                  </td>
                  <td className="hidden max-w-[10rem] truncate px-3 py-2.5 text-text-secondary xl:table-cell">{session.operatorName || "-"}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums text-text-secondary xl:table-cell">{brl(session.openingCents)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                    {session.soldCents !== null ? brl(session.soldCents) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                    {session.expectedCents !== null ? brl(session.expectedCents) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-text-primary">
                    {session.countedCents !== null ? brl(session.countedCents) : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${difference ? DIFF_CLASS[difference.tone] : "text-text-tertiary"}`}>
                    {difference ? (difference.tone === "ok" ? "Confere" : `${difference.tone === "short" ? "−" : "+"}${difference.value}`) : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {!isOpen ? (
                      <button
                        type="button"
                        onClick={() => onPrint(session)}
                        disabled={printingId !== null}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-hover-light hover:text-text-primary"
                        aria-label="Imprimir resumo deste fechamento"
                        title="Imprimir resumo deste fechamento"
                      >
                        <Printer size={16} className={printingId === session.id ? "animate-pulse" : ""} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!loading && sessions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-text-secondary">
                  Nenhum caixa aberto até agora.
                </td>
              </tr>
            ) : null}
            {loading && sessions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-text-secondary">
                  Carregando histórico...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {sessions.length > perPage ? (
        <div className="px-4 py-3">
          <TablePagination
            totalItems={sessions.length}
            currentPage={safePage}
            itemsPerPage={perPage}
            onPageChange={setPage}
            onItemsPerPageChange={(value) => {
              setPerPage(value);
              setPage(1);
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
