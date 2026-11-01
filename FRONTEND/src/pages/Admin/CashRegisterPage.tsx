/**
 * Arquivo: src/pages/Admin/CashRegisterPage.tsx
 * Objetivo: abrir o caixa, acompanhar o turno, registrar sangria/suprimento e
 * fechar com a conferência da gaveta (esperado × contado), com histórico.
 * Entradas esperadas: não recebe props; lê e grava tudo no Supabase pelo cashRegisterService.
 *
 * A conta do turno usa as vendas ligadas ao caixa aberto (sessao_caixa_id), não
 * "as vendas de hoje": um turno que passa da meia-noite continua certo, e cada
 * venda entra uma vez só, pelo valor que foi pago em cada forma.
 */
import { CircleCheck, Printer, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import CashClosePanel from "@/components/CashRegister/CashClosePanel";
import CashHistoryCard from "@/components/CashRegister/CashHistoryCard";
import CashMovementDialog from "@/components/CashRegister/CashMovementDialog";
import CashOpenPanel from "@/components/CashRegister/CashOpenPanel";
import CashStatusBanner from "@/components/CashRegister/CashStatusBanner";
import CashTurnSummary from "@/components/CashRegister/CashTurnSummary";
import {
  brl,
  describeDifference,
  formatShortDateTime,
  minutesBetween,
} from "@/components/CashRegister/cashFormat";
import LoadingBar from "@/components/Loading/LoadingBar";
import { Toast, useStatusDialog } from "@/hooks/Dialog";
import PageLayout from "@/layout/PageLayout";
import { companyService } from "@/services/api/companyService";
import {
  CASH_REGISTER_MAX_OPEN_MINUTES,
  cashRegisterService,
  type CashClosingResult,
  type CashMovementType,
  type CashRegisterSessionDto,
  type CashRegisterStatusDto,
  type CashSessionSummary,
} from "@/services/api/cashRegisterService";
import { printCashClosingReport } from "@/utils/cashClosingReport";
import { parseCentsBr } from "@/utils/pdvMoney";

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

async function companyName() {
  try {
    const company = await companyService.get();
    return company?.fantasyName || company?.corporateName || "CaixaUp";
  } catch {
    return "CaixaUp";
  }
}

export default function CashRegisterPage() {
  const statusDialog = useStatusDialog();
  const [cashStatus, setCashStatus] = useState<CashRegisterStatusDto | null>(null);
  const [statusError, setStatusError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [summary, setSummary] = useState<CashSessionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  const [history, setHistory] = useState<CashRegisterSessionDto[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const [openingInput, setOpeningInput] = useState("");
  const [countedInput, setCountedInput] = useState("");
  const [closingNote, setClosingNote] = useState("");

  const [movementType, setMovementType] = useState<CashMovementType | null>(null);
  const [movementSaving, setMovementSaving] = useState(false);
  const [closingResult, setClosingResult] = useState<CashClosingResult | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const requestId = useRef(0);

  const currentSession = cashStatus?.currentSession ?? null;
  const lastSession = cashStatus?.lastSession ?? null;
  const elapsedMinutes = currentSession ? minutesBetween(currentSession.openedAt, now) : 0;
  const expired =
    currentSession !== null &&
    (cashStatus?.state === "expirado" || elapsedMinutes >= CASH_REGISTER_MAX_OPEN_MINUTES);
  const bannerState = currentSession ? (expired ? "expirado" : "aberto") : "fechado";
  /** O resumo mostra o turno aberto ou, com o caixa fechado, o último turno. */
  const summarySession = currentSession ?? lastSession;
  const lastClosed = history.find((session) => session.status === "fechado") ?? lastSession;

  const loadSummary = useCallback(async (session: CashRegisterSessionDto | null, ticket: number) => {
    if (!session) {
      setSummary(null);
      setSummaryError("");
      return;
    }
    setSummaryLoading(true);
    try {
      const result = await cashRegisterService.summary(session);
      if (ticket !== requestId.current) return;
      setSummary(result);
      setSummaryError("");
    } catch (error) {
      if (ticket !== requestId.current) return;
      setSummaryError(errorText(error, "Não foi possível somar as vendas do caixa."));
    } finally {
      if (ticket === requestId.current) setSummaryLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await cashRegisterService.history());
      setHistoryError("");
    } catch (error) {
      setHistoryError(errorText(error, "Não foi possível carregar o histórico."));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  /** Recarrega tudo. Devolve false se nem a situação do caixa veio. */
  const refresh = useCallback(async () => {
    const ticket = ++requestId.current;
    setNow(Date.now());
    try {
      const status = await cashRegisterService.status();
      if (ticket !== requestId.current) return true;
      setCashStatus(status);
      setStatusError("");
      await Promise.all([
        loadSummary(status.currentSession ?? status.lastSession ?? null, ticket),
        loadHistory(),
      ]);
      return true;
    } catch (error) {
      if (ticket === requestId.current) {
        setStatusError(errorText(error, "Não foi possível ver a situação do caixa."));
      }
      return false;
    } finally {
      if (ticket === requestId.current) setLoading(false);
    }
  }, [loadHistory, loadSummary]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // Relógio do "aberto há" e da regra das 24 horas.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Com o caixa aberto, a conta acompanha as vendas feitas em outro computador.
  const currentSessionId = currentSession?.id ?? null;
  useEffect(() => {
    if (!currentSessionId || !currentSession) return;
    const update = () => {
      if (document.visibilityState !== "visible") return;
      void loadSummary(currentSession, requestId.current);
    };
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
    // currentSession muda de objeto a cada leitura; o id é o que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId, loadSummary]);

  const handleRefresh = async () => {
    setLoading(true);
    if (await refresh()) Toast.success("Caixa atualizado.");
  };

  const handleOpen = async () => {
    if (saving) return;
    const openingCents = parseCentsBr(openingInput);
    setSaving(true);
    try {
      await cashRegisterService.open(openingCents);
      setOpeningInput("");
      setClosingResult(null);
      Toast.success(`Caixa aberto com ${brl(openingCents)} de troco. Vendas liberadas.`);
    } catch (error) {
      Toast.error(errorText(error, "Não foi possível abrir o caixa."));
    } finally {
      await refresh();
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (!currentSession || saving) return;
    if (countedInput.trim() === "") {
      Toast.error("Digite quanto dinheiro tem na gaveta. Se não tiver nada, digite 0.");
      document.getElementById("cash-counted-amount")?.focus();
      return;
    }

    const countedCents = parseCentsBr(countedInput);
    const expected = summary?.sessionId === currentSession.id ? summary.expectedCashCents : null;
    const difference = expected !== null ? describeDifference(countedCents - expected) : null;
    const message = [
      `Fechar o caixa com ${brl(countedCents)} contados na gaveta?`,
      difference
        ? difference.tone === "ok"
          ? "Confere com o esperado."
          : `${difference.label} de ${difference.value} em relação ao esperado (${brl(expected ?? 0)}).`
        : "",
      "As vendas ficam bloqueadas até abrir de novo.",
    ]
      .filter(Boolean)
      .join(" ");

    const confirmed = await statusDialog.confirm(message, {
      confirmLabel: "Fechar caixa",
      cancelLabel: "Voltar",
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      const result = await cashRegisterService.close(currentSession.id, countedCents, closingNote);
      setClosingResult(result);
      setCountedInput("");
      setClosingNote("");
      const diff = describeDifference(result.differenceCents);
      Toast.success(
        diff.tone === "ok"
          ? "Caixa fechado. A gaveta confere."
          : `Caixa fechado. ${diff.label} de ${diff.value} na gaveta.`,
      );
    } catch (error) {
      Toast.error(errorText(error, "Não foi possível fechar o caixa."));
    } finally {
      await refresh();
      setSaving(false);
    }
  };

  const handleMovement = async (type: CashMovementType, cents: number, reason: string) => {
    if (!currentSession) return;
    setMovementSaving(true);
    try {
      await cashRegisterService.addMovement(currentSession.id, type, cents, reason);
      setMovementType(null);
      Toast.success(type === "sangria" ? `Sangria de ${brl(cents)} registrada.` : `Suprimento de ${brl(cents)} registrado.`);
      await loadSummary(currentSession, requestId.current);
    } catch (error) {
      Toast.error(errorText(error, "Não foi possível registrar."));
    } finally {
      setMovementSaving(false);
    }
  };

  const printResult = async (result: CashClosingResult) => {
    const printed = printCashClosingReport(result, await companyName());
    if (!printed) Toast.error("Não foi possível abrir a impressão.");
  };

  const handlePrintHistory = async (session: CashRegisterSessionDto) => {
    setPrintingId(session.id);
    try {
      const sessionSummary = await cashRegisterService.summary(session);
      const counted = session.countedCents ?? 0;
      const expected = session.expectedCents ?? sessionSummary.expectedCashCents;
      await printResult({
        session,
        summary: { ...sessionSummary, expectedCashCents: expected },
        countedCents: counted,
        differenceCents: counted - expected,
      });
    } catch (error) {
      Toast.error(errorText(error, "Não foi possível montar o resumo para imprimir."));
    } finally {
      setPrintingId(null);
    }
  };

  if (loading && !cashStatus && !statusError) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-text-secondary">
        <LoadingBar />
      </div>
    );
  }

  const summaryTitle = currentSession ? "Resumo do turno" : "Último turno";
  const summarySubtitle = summarySession
    ? currentSession
      ? `Tudo que entrou desde a abertura, ${formatShortDateTime(summarySession.openedAt)}.`
      : `De ${formatShortDateTime(summarySession.openedAt)} a ${formatShortDateTime(summarySession.closedAt)}.`
    : "";
  const closingDiff = closingResult ? describeDifference(closingResult.differenceCents) : null;

  return (
    <PageLayout size="wide" className="space-y-4">
      <PageHeader
        title="Caixa"
        description="Abra o caixa para vender, registre sangrias e feche conferindo o dinheiro da gaveta."
        action={
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border-secondary px-4 text-sm font-semibold text-text-secondary transition hover:bg-hover-light hover:text-text-primary"
            disabled={loading || saving}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        }
      />

      {statusError ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-primary/40 bg-primary/5 p-4" role="alert">
          <p className="text-sm text-primary">
            <strong>Sem conexão com o caixa.</strong> {statusError} Nada foi alterado.
          </p>
          <button type="button" onClick={handleRefresh} className="btn-back !min-h-10 !py-2">
            Tentar de novo
          </button>
        </div>
      ) : null}

      {cashStatus ? (
        <>
          <CashStatusBanner
            state={bannerState}
            session={currentSession}
            lastSession={lastClosed}
            elapsedMinutes={elapsedMinutes}
            soldCents={currentSession && summary?.sessionId === currentSession.id ? summary.soldCents : null}
            salesCount={currentSession && summary?.sessionId === currentSession.id ? summary.salesCount : null}
            expectedCashCents={
              currentSession && summary?.sessionId === currentSession.id ? summary.expectedCashCents : null
            }
          />

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
            <div className="order-2 min-w-0 lg:order-1">
              {summarySession ? (
                <CashTurnSummary
                  title={summaryTitle}
                  subtitle={summarySubtitle}
                  summary={summary?.sessionId === summarySession.id ? summary : null}
                  loading={summaryLoading}
                  error={summaryError}
                  canMove={Boolean(currentSession)}
                  onMove={setMovementType}
                />
              ) : (
                <article className="card p-5 text-sm text-text-secondary">
                  <h2 className="text-lg font-bold text-text-primary">Primeiro caixa</h2>
                  <p className="mt-1">
                    Depois de abrir, aqui aparece o resumo do turno: total vendido, quanto entrou em cada forma de
                    pagamento e o dinheiro que deve estar na gaveta.
                  </p>
                </article>
              )}
            </div>

            <div className="order-1 space-y-4 lg:order-2">
              {closingResult && closingDiff && !currentSession ? (
                <section
                  className={`card flex items-start gap-3 p-4 ${
                    closingDiff.tone === "short" ? "border-primary/40" : "border-success/40"
                  }`}
                  role="status"
                >
                  <CircleCheck
                    size={22}
                    className={`mt-0.5 shrink-0 ${closingDiff.tone === "short" ? "text-primary" : "text-success"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-text-primary">Caixa fechado</p>
                    <p className="text-sm text-text-secondary">
                      Esperado {brl(closingResult.summary.expectedCashCents)}, contado {brl(closingResult.countedCents)}
                      {closingDiff.tone === "ok" ? ". Confere." : `. ${closingDiff.label} de ${closingDiff.value}.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => void printResult(closingResult)}
                      className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg border border-border-secondary px-3 text-sm font-semibold text-text-primary hover:bg-hover-light"
                    >
                      <Printer size={16} />
                      Imprimir fechamento
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setClosingResult(null)}
                    className="rounded-md p-1 text-text-tertiary hover:bg-hover-light hover:text-text-primary"
                    aria-label="Dispensar aviso"
                  >
                    <X size={16} />
                  </button>
                </section>
              ) : null}

              {currentSession ? (
                <CashClosePanel
                  summary={summary?.sessionId === currentSession.id ? summary : null}
                  openingCents={currentSession.openingCents}
                  counted={countedInput}
                  onCountedChange={setCountedInput}
                  note={closingNote}
                  onNoteChange={setClosingNote}
                  onSubmit={handleClose}
                  saving={saving}
                  expired={expired}
                />
              ) : (
                <CashOpenPanel
                  value={openingInput}
                  onChange={setOpeningInput}
                  onSubmit={handleOpen}
                  saving={saving}
                  lastCountedCents={lastClosed?.countedCents ?? null}
                />
              )}

              <section className="rounded-xl border border-border-primary px-4 py-3 text-sm text-text-secondary">
                <p className="font-semibold text-text-primary">Regras do caixa</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Só dá para vender com o caixa aberto.</li>
                  <li>Um caixa aberto há mais de 24 horas para de vender até ser fechado.</li>
                  <li>Um caixa por vez: feche o atual antes de abrir outro.</li>
                </ul>
              </section>
            </div>
          </div>

          <CashHistoryCard
            sessions={history}
            loading={historyLoading}
            error={historyError}
            printingId={printingId}
            onPrint={(session) => void handlePrintHistory(session)}
          />
        </>
      ) : null}

      {movementType && currentSession ? (
        <CashMovementDialog
          initialType={movementType}
          expectedCashCents={summary?.sessionId === currentSession.id ? summary.expectedCashCents : null}
          saving={movementSaving}
          onCancel={() => setMovementType(null)}
          onConfirm={(type, cents, reason) => void handleMovement(type, cents, reason)}
        />
      ) : null}

      {statusDialog.Dialog}
    </PageLayout>
  );
}
