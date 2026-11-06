/**
 * Arquivo: src/services/api/cashRegisterService.ts
 * Objetivo: abertura, fechamento, conferência e histórico do caixa direto no Supabase.
 * Tabelas: sessoes_caixa (o turno), vendas + pagamentos (o que entrou no turno),
 * caixas (terminal padrão), movimentacoes_caixa (sangria e suprimento) e
 * registros_operacionais (resumo de cada fechamento, para o histórico).
 *
 * Dinheiro é contado em centavos inteiros (ver utils/pdvMoney) para a conta da
 * gaveta fechar exata.
 */
import { supabase, currentCompanyId, currentUserId } from "@/lib/supabase";
import { toCents, toReais } from "@/utils/pdvMoney";

/** Caixa aberto há mais que isso para de vender até ser fechado e aberto de novo. */
export const CASH_REGISTER_MAX_OPEN_MINUTES = 24 * 60;

/** Resumo de cada fechamento (esperado, contado, por forma de pagamento). */
const CLOSINGS_MODULE = "caixa-fechamentos";

export type CashRegisterSessionDto = {
  id: string;
  status: string;
  openedAt: string;
  closedAt?: string | null;
  /** Valor inicial em texto pt-BR ("150,00"), mantido para as telas antigas. */
  openingAmount: string;
  /** Valor contado no fechamento em texto pt-BR. */
  closingAmount: string;
  openingCents: number;
  /** Dinheiro contado na gaveta ao fechar (null enquanto aberto). */
  countedCents: number | null;
  /** Dinheiro que deveria estar na gaveta ao fechar (null em caixas antigos). */
  expectedCents: number | null;
  /** Total vendido no turno, quando o fechamento guardou o resumo. */
  soldCents: number | null;
  salesCount: number | null;
  operatorName: string;
  closedByName: string;
  note: string;
  elapsedMinutes: number;
  /** Quando o caixa aberto deixa de vender (24 h depois da abertura). */
  expiresAt: string | null;
};

export type CashRegisterStatusDto = {
  state: "aberto" | "fechado" | "expirado" | string;
  canSell: boolean;
  blockReason: string;
  serverNow: string;
  currentSession?: CashRegisterSessionDto | null;
  lastSession?: CashRegisterSessionDto | null;
};

export type CashPaymentTotal = {
  method: string;
  label: string;
  cents: number;
  /** Quantas vendas usaram esta forma (uma venda dividida conta nas duas). */
  count: number;
};

export type CashMovementType = "sangria" | "suprimento";

export type CashMovementDto = {
  id: string;
  type: CashMovementType;
  cents: number;
  reason: string;
  operatorName: string;
  createdAt: string;
};

export type CashSessionSummary = {
  sessionId: string;
  openingCents: number;
  salesCount: number;
  canceledCount: number;
  soldCents: number;
  byPayment: CashPaymentTotal[];
  cashSalesCents: number;
  fiadoCents: number;
  suprimentoCents: number;
  sangriaCents: number;
  /** Fundo de troco + vendas em dinheiro + suprimentos − sangrias. */
  expectedCashCents: number;
  movements: CashMovementDto[];
  /** false quando não deu para ler sangrias/suprimentos (a conta sai sem eles). */
  movementsAvailable: boolean;
};

export type CashClosingResult = {
  session: CashRegisterSessionDto;
  summary: CashSessionSummary;
  countedCents: number;
  differenceCents: number;
};

type SessionRow = {
  id: string;
  status: string | null;
  data_abertura: string | null;
  data_fechamento: string | null;
  valor_inicial: number | string | null;
  valor_informado?: number | string | null;
  valor_esperado?: number | string | null;
  observacao?: string | null;
  perfis?: { nome?: string | null } | null;
};

type SaleRow = {
  id: string;
  total: number | string | null;
  status: string | null;
  pagamentos?: Array<{ forma: string | null; valor: number | string | null }> | null;
};

type MovementRow = {
  id: string;
  tipo: string | null;
  valor: number | string | null;
  motivo: string | null;
  created_at: string;
  perfis?: { nome?: string | null } | null;
};

type ClosingRecord = {
  sessaoId?: string;
  esperadoCentavos?: number;
  vendidoCentavos?: number;
  qtdVendas?: number;
};

type SupabaseError = { code?: string; message?: string } | null;

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  fiado: "Fiado",
  cheque: "Cheque",
  outros: "Outros meios",
};

/** Formas que aparecem sempre no resumo, mesmo zeradas. */
const MAIN_PAYMENTS = ["dinheiro", "pix", "debito", "credito", "fiado"];

function centsFromDb(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const num = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? toCents(num) : 0;
}

function centsToText(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function minutesSince(iso: string, now = Date.now()) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((now - time) / 60000));
}

function shortDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} às ${time}`;
}

function toSession(row: SessionRow, closing?: ClosingRecord): CashRegisterSessionDto {
  const openedAt = row.data_abertura ?? "";
  const status = row.status ?? "";
  const isOpen = status === "aberto";
  const openingCents = centsFromDb(row.valor_inicial);
  const countedCents = isOpen || row.valor_informado == null ? null : centsFromDb(row.valor_informado);
  const expectedFromRow = row.valor_esperado == null ? null : centsFromDb(row.valor_esperado);
  const expectedCents = isOpen
    ? null
    : (expectedFromRow ?? (typeof closing?.esperadoCentavos === "number" ? closing.esperadoCentavos : null));
  const openedTime = new Date(openedAt).getTime();

  return {
    id: row.id,
    status,
    openedAt,
    closedAt: row.data_fechamento ?? null,
    openingAmount: centsToText(openingCents),
    closingAmount: centsToText(countedCents ?? 0),
    openingCents,
    countedCents,
    expectedCents,
    soldCents: typeof closing?.vendidoCentavos === "number" ? closing.vendidoCentavos : null,
    salesCount: typeof closing?.qtdVendas === "number" ? closing.qtdVendas : null,
    operatorName: row.perfis?.nome ?? "",
    closedByName: "",
    note: row.observacao ?? "",
    elapsedMinutes: openedAt ? minutesSince(openedAt) : 0,
    expiresAt:
      isOpen && !Number.isNaN(openedTime)
        ? new Date(openedTime + CASH_REGISTER_MAX_OPEN_MINUTES * 60000).toISOString()
        : null,
  };
}

function isMissingColumn(error: SupabaseError, column: string) {
  if (!error) return false;
  const message = error.message ?? "";
  return (error.code === "PGRST204" || error.code === "42703") && message.includes(column);
}

async function requireCompany() {
  const empresaId = await currentCompanyId();
  if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");
  return empresaId;
}

async function currentUserInfo() {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sua sessão expirou. Entre de novo para continuar.");
  const { data } = await supabase.from("perfis").select("nome").eq("id", userId).maybeSingle();
  return { id: userId, name: (data as { nome?: string | null } | null)?.nome ?? "" };
}

async function fetchSessionSales(empresaId: string, sessionId: string) {
  const pageSize = 1000;
  const rows: SaleRow[] = [];
  for (let from = 0; from < 50000; from += pageSize) {
    const { data, error } = await supabase
      .from("vendas")
      .select("id, total, status, pagamentos(forma, valor)")
      .eq("empresa_id", empresaId)
      .eq("sessao_caixa_id", sessionId)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as SaleRow[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchMovements(empresaId: string, sessionId: string) {
  const { data, error } = await supabase
    .from("movimentacoes_caixa")
    .select("id, tipo, valor, motivo, created_at, perfis(nome)")
    .eq("empresa_id", empresaId)
    .eq("sessao_caixa_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) return { movements: [] as CashMovementDto[], available: false };

  const movements = ((data ?? []) as unknown as MovementRow[])
    .filter((row) => row.tipo === "sangria" || row.tipo === "suprimento")
    .map((row) => ({
      id: row.id,
      type: row.tipo as CashMovementType,
      cents: centsFromDb(row.valor),
      reason: row.motivo ?? "",
      operatorName: row.perfis?.nome ?? "",
      createdAt: row.created_at,
    }));
  return { movements, available: true };
}

function buildSummary(
  sessionId: string,
  openingCents: number,
  sales: SaleRow[],
  movements: CashMovementDto[],
  movementsAvailable: boolean,
): CashSessionSummary {
  const totals = new Map<string, { cents: number; count: number }>();
  let soldCents = 0;
  let salesCount = 0;
  let canceledCount = 0;

  for (const sale of sales) {
    const status = (sale.status ?? "concluida").toLowerCase();
    if (status !== "concluida") {
      canceledCount += 1;
      continue;
    }
    salesCount += 1;
    const saleCents = centsFromDb(sale.total);
    soldCents += saleCents;

    const payments = sale.pagamentos ?? [];
    if (payments.length === 0) {
      const entry = totals.get("outros") ?? { cents: 0, count: 0 };
      totals.set("outros", { cents: entry.cents + saleCents, count: entry.count + 1 });
      continue;
    }
    const usedHere = new Set<string>();
    for (const payment of payments) {
      const method = (payment.forma ?? "outros").toLowerCase() || "outros";
      const entry = totals.get(method) ?? { cents: 0, count: 0 };
      totals.set(method, {
        cents: entry.cents + centsFromDb(payment.valor),
        count: entry.count + (usedHere.has(method) ? 0 : 1),
      });
      usedHere.add(method);
    }
  }

  const extraMethods = [...totals.keys()].filter((method) => !MAIN_PAYMENTS.includes(method));
  const byPayment = [...MAIN_PAYMENTS, ...extraMethods].map((method) => ({
    method,
    label: PAYMENT_LABELS[method] ?? method.charAt(0).toUpperCase() + method.slice(1),
    cents: totals.get(method)?.cents ?? 0,
    count: totals.get(method)?.count ?? 0,
  }));

  const cashSalesCents = totals.get("dinheiro")?.cents ?? 0;
  const fiadoCents = totals.get("fiado")?.cents ?? 0;
  const suprimentoCents = movements
    .filter((movement) => movement.type === "suprimento")
    .reduce((sum, movement) => sum + movement.cents, 0);
  const sangriaCents = movements
    .filter((movement) => movement.type === "sangria")
    .reduce((sum, movement) => sum + movement.cents, 0);

  return {
    sessionId,
    openingCents,
    salesCount,
    canceledCount,
    soldCents,
    byPayment,
    cashSalesCents,
    fiadoCents,
    suprimentoCents,
    sangriaCents,
    expectedCashCents: openingCents + cashSalesCents + suprimentoCents - sangriaCents,
    movements,
    movementsAvailable,
  };
}

async function fetchOpenSession(empresaId: string) {
  const { data, error } = await supabase
    .from("sessoes_caixa")
    .select("*, perfis(nome)")
    .eq("empresa_id", empresaId)
    .eq("status", "aberto")
    .order("data_abertura", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = ((data ?? []) as SessionRow[])[0];
  return row ? toSession(row) : null;
}

export const cashRegisterService = {
  /**
   * Situação do caixa para liberar ou bloquear a venda. A frente de caixa chama
   * isto a cada venda, então busca só o caixa aberto e o último fechado.
   * Erro de rede vira exceção: assim a tela não mostra "fechado" por engano e o
   * operador não abre um segundo caixa sem querer.
   */
  async status(): Promise<CashRegisterStatusDto> {
    const empresaId = await currentCompanyId();
    if (!empresaId) {
      return {
        state: "fechado",
        canSell: false,
        blockReason: "Nenhuma empresa vinculada ao seu usuário.",
        serverNow: new Date().toISOString(),
        currentSession: null,
        lastSession: null,
      };
    }

    const [aberta, lastResult] = await Promise.all([
      fetchOpenSession(empresaId),
      supabase
        .from("sessoes_caixa")
        .select("*, perfis(nome)")
        .eq("empresa_id", empresaId)
        .eq("status", "fechado")
        .order("data_fechamento", { ascending: false, nullsFirst: false })
        .limit(1),
    ]);
    const lastRow = ((lastResult.data ?? []) as SessionRow[])[0];
    const lastSession = lastRow ? toSession(lastRow) : null;

    if (aberta && aberta.elapsedMinutes >= CASH_REGISTER_MAX_OPEN_MINUTES) {
      return {
        state: "expirado",
        canSell: false,
        blockReason: `O caixa está aberto desde ${shortDateTime(aberta.openedAt)}, há mais de 24 horas. Feche este caixa e abra um novo para continuar vendendo.`,
        serverNow: new Date().toISOString(),
        currentSession: aberta,
        lastSession,
      };
    }

    return {
      state: aberta ? "aberto" : "fechado",
      canSell: Boolean(aberta),
      blockReason: aberta ? "" : "O caixa está fechado. Abra o caixa para iniciar as vendas.",
      serverNow: new Date().toISOString(),
      currentSession: aberta,
      lastSession,
    };
  },

  /** Conta do turno: vendas por forma de pagamento, sangrias, suprimentos e o esperado na gaveta. */
  async summary(session: Pick<CashRegisterSessionDto, "id" | "openingCents">): Promise<CashSessionSummary> {
    const empresaId = await requireCompany();
    const [sales, movementResult] = await Promise.all([
      fetchSessionSales(empresaId, session.id),
      fetchMovements(empresaId, session.id),
    ]);
    return buildSummary(
      session.id,
      session.openingCents,
      sales,
      movementResult.movements,
      movementResult.available,
    );
  },

  /** Últimos caixas da empresa, com esperado/contado quando o fechamento guardou. */
  async history(limit = 60): Promise<CashRegisterSessionDto[]> {
    const empresaId = await requireCompany();
    const [sessionsResult, closingsResult] = await Promise.all([
      supabase
        .from("sessoes_caixa")
        .select("*, perfis(nome)")
        .eq("empresa_id", empresaId)
        .order("data_abertura", { ascending: false })
        .limit(limit),
      supabase
        .from("registros_operacionais")
        .select("dados")
        .eq("empresa_id", empresaId)
        .eq("modulo", CLOSINGS_MODULE)
        .order("created_at", { ascending: false })
        .limit(limit * 2),
    ]);
    if (sessionsResult.error) throw sessionsResult.error;

    const closings = new Map<string, ClosingRecord>();
    for (const row of (closingsResult.error ? [] : closingsResult.data ?? []) as Array<{ dados: ClosingRecord | null }>) {
      const sessaoId = row.dados?.sessaoId;
      if (sessaoId && !closings.has(sessaoId)) closings.set(sessaoId, row.dados as ClosingRecord);
    }

    return ((sessionsResult.data ?? []) as SessionRow[]).map((row) => toSession(row, closings.get(row.id)));
  },

  async open(openingCents: number) {
    const empresaId = await requireCompany();
    const user = await currentUserInfo();

    // Um caixa por vez: se outro computador já abriu, não cria um segundo.
    const jaAberto = await fetchOpenSession(empresaId);
    if (jaAberto) {
      throw new Error(
        `Já existe um caixa aberto desde ${shortDateTime(jaAberto.openedAt)}${
          jaAberto.operatorName ? ` (${jaAberto.operatorName})` : ""
        }. A tela foi atualizada.`,
      );
    }

    const { data: caixas } = await supabase
      .from("caixas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .limit(1);
    const caixaId = (caixas && (caixas[0] as { id?: string } | undefined)?.id) ?? null;

    const { error } = await supabase.from("sessoes_caixa").insert({
      empresa_id: empresaId,
      caixa_id: caixaId,
      usuario_id: user.id,
      valor_inicial: toReais(Math.max(0, Math.round(openingCents))),
      status: "aberto",
    });
    if (error) throw error;

    return this.status();
  },

  /** Registra uma sangria (retirada) ou um suprimento (reforço) no caixa aberto. */
  async addMovement(sessionId: string, type: CashMovementType, cents: number, reason: string) {
    const empresaId = await requireCompany();
    const amount = Math.round(cents);
    if (!(amount > 0)) throw new Error("Informe um valor maior que zero.");

    const { data: sessao, error: sessaoError } = await supabase
      .from("sessoes_caixa")
      .select("id, status")
      .eq("empresa_id", empresaId)
      .eq("id", sessionId)
      .maybeSingle();
    if (sessaoError) throw sessaoError;
    if (!sessao || (sessao as { status?: string }).status !== "aberto") {
      throw new Error("Este caixa já foi fechado. Atualize a tela.");
    }

    const user = await currentUserInfo();
    const { error } = await supabase.from("movimentacoes_caixa").insert({
      empresa_id: empresaId,
      sessao_caixa_id: sessionId,
      usuario_id: user.id,
      tipo: type,
      valor: toReais(amount),
      motivo: reason.trim(),
    });
    if (error) throw error;
  },

  /**
   * Fecha o caixa com a conferência: refaz a conta do turno na hora (não usa o
   * que estava na tela), grava o contado e o esperado e guarda o resumo para o
   * histórico e a impressão.
   */
  async close(sessionId: string, countedCents: number, note = ""): Promise<CashClosingResult> {
    const empresaId = await requireCompany();

    const { data: row, error: rowError } = await supabase
      .from("sessoes_caixa")
      .select("*, perfis(nome)")
      .eq("empresa_id", empresaId)
      .eq("id", sessionId)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!row) throw new Error("Caixa não encontrado. Atualize a tela.");
    if ((row as SessionRow).status !== "aberto") {
      throw new Error("Este caixa já foi fechado (talvez em outro computador). Atualize a tela.");
    }

    const session = toSession(row as SessionRow);
    const summary = await this.summary(session);
    const counted = Math.max(0, Math.round(countedCents));
    const closedAt = new Date().toISOString();
    const base = {
      status: "fechado",
      data_fechamento: closedAt,
      valor_informado: toReais(counted),
      observacao: note.trim(),
    };

    let result = await supabase
      .from("sessoes_caixa")
      .update({
        ...base,
        valor_esperado: toReais(summary.expectedCashCents),
        diferenca: toReais(counted - summary.expectedCashCents),
      })
      .eq("id", sessionId)
      .eq("status", "aberto")
      .select("id");
    if (isMissingColumn(result.error, "valor_esperado") || isMissingColumn(result.error, "diferenca")) {
      // Banco sem a coluna: o esperado fica só no resumo do fechamento.
      result = await supabase
        .from("sessoes_caixa")
        .update(base)
        .eq("id", sessionId)
        .eq("status", "aberto")
        .select("id");
    }
    if (result.error) throw result.error;
    if (!result.data || result.data.length === 0) {
      throw new Error("Este caixa já foi fechado (talvez em outro computador). Atualize a tela.");
    }

    const user = await currentUserInfo().catch(() => ({ id: "", name: "" }));
    // O resumo é um extra para o histórico: se falhar, o caixa continua fechado.
    await supabase
      .from("registros_operacionais")
      .insert({
        empresa_id: empresaId,
        modulo: CLOSINGS_MODULE,
        dados: {
          sessaoId: sessionId,
          abertoEm: session.openedAt,
          fechadoEm: closedAt,
          fechadoPor: user.name,
          inicialCentavos: summary.openingCents,
          vendidoCentavos: summary.soldCents,
          qtdVendas: summary.salesCount,
          canceladas: summary.canceledCount,
          porForma: summary.byPayment.map(({ method, cents, count }) => ({ forma: method, centavos: cents, vendas: count })),
          suprimentosCentavos: summary.suprimentoCents,
          sangriasCentavos: summary.sangriaCents,
          esperadoCentavos: summary.expectedCashCents,
          contadoCentavos: counted,
          diferencaCentavos: counted - summary.expectedCashCents,
          observacao: note.trim(),
        },
      })
      .then(
        () => undefined,
        () => undefined,
      );

    return {
      session: {
        ...session,
        status: "fechado",
        closedAt,
        countedCents: counted,
        closingAmount: centsToText(counted),
        expectedCents: summary.expectedCashCents,
        soldCents: summary.soldCents,
        salesCount: summary.salesCount,
        closedByName: user.name,
        note: note.trim(),
        expiresAt: null,
      },
      summary,
      countedCents: counted,
      differenceCents: counted - summary.expectedCashCents,
    };
  },
};
