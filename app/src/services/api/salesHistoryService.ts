import { squareApi } from "@/services/api/squareApi";

export type SaleHistoryDto = {
  saleNumber: string; customerName: string; customerCpf: string; paymentType: string;
  totalAmount: string; operatorName: string; productCode: string; productName: string;
  quantity: number; unitPrice: string; itemTotal: string; saleDate: string;
  payments: Array<{ forma: string; valor: number }>; discountAmount: string;
};
export type CreditDebtDto = { customerName: string; customerCpf: string; salesCount: number; fullValueCents: number; openValueCents: number; lastSaleDate: string };
export type RegisterSalePayload = {
  requestId: string; editingSaleNumber?: string; claimToken?: string; discountAmount?: number;
  customerId?: string; customerName: string; customerCpf: string; paymentType: string;
  totalAmount: string; operatorName: string; allowSellingWithoutStock?: boolean;
  payments?: Array<{ forma: string; valor: number }>;
  items: Array<{ productId: string; productCode: string; productName: string; quantity: number; unitPrice: number }>;
};
export type CreditPaymentMethod = "dinheiro" | "pix" | "debito" | "credito";
export type CreditReceipt = { id: string; paidAt: string; operatorName: string; payments: Array<{ forma: CreditPaymentMethod; amountCents: number }> };
export type CreditSaleDto = {
  id: string; saleNumber: string; customerName: string; customerCpf: string; saleDate: string;
  items: RegisterSalePayload["items"]; discountCents: number; totalCents: number; paidCents: number;
  openCents: number; initialPaidCents: number; legacyPaidCents: number; legacyPaidAt?: string;
  receipts: CreditReceipt[]; revision: string;
};

export const salesHistoryService = {
  listCreditSales: () => squareApi<CreditSaleDto[]>("/credit-sales"),
  updateCreditQuantities: (input: { saleId: string; revision: string; quantities: number[] }) =>
    squareApi<CreditSaleDto>(`/credit-sales/${encodeURIComponent(input.saleId)}/quantities`, { method: "PUT", body: JSON.stringify(input) }),
  receiveCreditPayment: (input: { saleId: string; revision: string; requestId: string; payments: CreditReceipt["payments"] }) =>
    squareApi<CreditSaleDto>(`/credit-sales/${encodeURIComponent(input.saleId)}/receipts`, { method: "POST", body: JSON.stringify(input) }),
  list: () => squareApi<SaleHistoryDto[]>("/sales"),
  listCreditDebts: () => squareApi<CreditDebtDto[]>("/credit-debts"),
  async register(payload: RegisterSalePayload) {
    const result = await squareApi<{ saleNumber: string; saleId: string; total: number; replayed: boolean }>("/sales", { method: "POST", body: JSON.stringify(payload) });
    if (!result || typeof result.saleNumber !== "string" || !result.saleNumber.trim()
      || typeof result.saleId !== "string" || !result.saleId.trim()
      || !Number.isFinite(result.total) || result.total <= 0 || typeof result.replayed !== "boolean") {
      throw new Error("O servidor não confirmou a venda. Confira o histórico antes de tentar novamente.");
    }
    return result;
  },
  print: (saleNumber: string) => squareApi<{ saleNumber: string; printedAt: string; items: number; rows: SaleHistoryDto[] }>(`/sales/${encodeURIComponent(saleNumber)}/print`),
};
