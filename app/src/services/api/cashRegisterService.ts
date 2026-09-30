import { squareApi } from "@/services/api/squareApi";

export type CashRegisterSessionDto = { id: string; status: string; openedAt: string; closedAt?: string | null; openingAmount: string; closingAmount: string; operatorName: string; closedByName: string; note: string; elapsedMinutes: number };
export type CashRegisterStatusDto = { state: "aberto" | "fechado" | "expirado" | string; canSell: boolean; blockReason: string; serverNow: string; currentSession?: CashRegisterSessionDto | null; lastSession?: CashRegisterSessionDto | null; history: CashRegisterSessionDto[] };
export type CashRegisterProductSummaryDto = { name: string; quantity: number; total: number };
export type CashRegisterSummaryDto = { saleCount: number; itemCount: number; totalSales: number; totalReceived: number; paymentTotals: Record<string, number>; products: CashRegisterProductSummaryDto[] };

export const cashRegisterService = {
  status: () => squareApi<CashRegisterStatusDto>("/cash/status"),
  async open(openingAmount: string) { await squareApi("/cash/open", { method: "POST", body: JSON.stringify({ openingAmount }) }); return this.status(); },
  summary: (sessionId?: string | null): Promise<CashRegisterSummaryDto> => sessionId ? squareApi<CashRegisterSummaryDto>(`/cash/${encodeURIComponent(sessionId)}/summary`) : Promise.resolve({ saleCount: 0, itemCount: 0, totalSales: 0, totalReceived: 0, paymentTotals: {}, products: [] }),
  async close(closingAmount: string, note = "") { await squareApi("/cash/close", { method: "POST", body: JSON.stringify({ closingAmount, note }) }); return this.status(); },
};
