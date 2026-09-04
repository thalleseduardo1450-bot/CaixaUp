/** Vendas concluídas neste computador. Nenhum dado desta camada vai ao Supabase. */
import { getStoredAuthUser } from "@/utils/authStorage";

export type SaleHistoryDto = {
  saleNumber: string;
  customerName: string;
  customerCpf: string;
  paymentType: string;
  totalAmount: string;
  operatorName: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  itemTotal: string;
  saleDate: string;
};

export type RegisterSalePayload = {
  requestId: string;
  editingSaleNumber?: string;
  claimToken?: string;
  discountAmount?: number;
  customerId?: string;
  customerName: string;
  customerCpf: string;
  paymentType: string;
  totalAmount: string;
  operatorName: string;
  allowSellingWithoutStock?: boolean;
  payments?: Array<{ forma: string; valor: number }>;
  items: Array<{ productId: string; productCode: string; productName: string; quantity: number; unitPrice: number }>;
};

type LocalSale = {
  id: string;
  saleNumber: string;
  customerName: string;
  customerCpf: string;
  paymentType: string;
  totalAmount: string;
  operatorName: string;
  saleDate: string;
  items: RegisterSalePayload["items"];
};

const SALES_KEY = "caixaup.local-sales.v1";
const SALE_NUMBER_KEY = "caixaup.local-sale-number.v1";

function storageKey(key: string) {
  const user = getStoredAuthUser();
  return `${key}:${user?.companyId ?? "computador"}:${user?.id ?? "operador"}`;
}

function readSales(): LocalSale[] {
  try {
    const raw = window.localStorage.getItem(storageKey(SALES_KEY));
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveSales(sales: LocalSale[]) {
  try {
    window.localStorage.setItem(storageKey(SALES_KEY), JSON.stringify(sales));
  } catch {
    throw new Error("Não foi possível salvar a venda neste computador. Libere espaço no sistema antes de tentar novamente.");
  }
}

function nextSaleNumber(): string {
  const key = storageKey(SALE_NUMBER_KEY);
  const current = Number(window.localStorage.getItem(key) ?? "0");
  const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
  window.localStorage.setItem(key, String(next));
  return String(next);
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "0").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: number | string | null | undefined) {
  return toNumber(value).toFixed(2).replace(".", ",");
}

function saleRows(sale: LocalSale): SaleHistoryDto[] {
  return sale.items.map((item) => ({
    saleNumber: sale.saleNumber,
    customerName: sale.customerName || "Consumidor",
    customerCpf: sale.customerCpf,
    paymentType: sale.paymentType,
    totalAmount: sale.totalAmount,
    operatorName: sale.operatorName,
    productCode: item.productCode,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: toText(item.unitPrice),
    itemTotal: toText(item.unitPrice * item.quantity),
    saleDate: sale.saleDate,
  }));
}

export const salesHistoryService = {
  async list() {
    return readSales().sort((a, b) => b.saleDate.localeCompare(a.saleDate)).flatMap(saleRows);
  },

  async register(payload: RegisterSalePayload) {
    if (!payload.requestId || payload.items.length === 0 || payload.items.some((item) => !item.productId || item.quantity <= 0 || !Number.isFinite(item.unitPrice))) {
      throw new Error("Confira os produtos e as quantidades antes de finalizar.");
    }
    const sales = readSales();
    const previous = sales.find((sale) => sale.id === payload.requestId);
    if (previous) return { saleNumber: previous.saleNumber, saleId: previous.id, total: toNumber(previous.totalAmount), replayed: true };

    const total = toNumber(payload.totalAmount);
    const paid = (payload.payments?.length ? payload.payments : [{ forma: payload.paymentType, valor: total }])
      .reduce((sum, payment) => sum + toNumber(payment.valor), 0);
    if (total <= 0 || Math.abs(paid - total) > 0.001) throw new Error("A soma dos pagamentos deve corresponder ao total.");

    const oldSale = payload.editingSaleNumber
      ? sales.find((sale) => sale.saleNumber === payload.editingSaleNumber)
      : undefined;
    if (payload.editingSaleNumber && !oldSale) throw new Error("Venda original não encontrada neste computador.");
    const sale: LocalSale = {
      id: oldSale?.id ?? payload.requestId,
      saleNumber: oldSale?.saleNumber ?? nextSaleNumber(),
      customerName: payload.customerName || "Consumidor",
      customerCpf: payload.customerCpf || "",
      paymentType: payload.paymentType,
      totalAmount: toText(total),
      operatorName: payload.operatorName,
      saleDate: new Date().toISOString(),
      items: payload.items,
    };
    saveSales(oldSale ? sales.map((entry) => entry.saleNumber === sale.saleNumber ? sale : entry) : [...sales, sale]);
    return { saleNumber: sale.saleNumber, saleId: sale.id, total, replayed: false };
  },

  async print(saleNumber: string) {
    const sale = readSales().find((entry) => entry.saleNumber === saleNumber);
    if (!sale) throw new Error("Venda não encontrada neste computador.");
    const rows = saleRows(sale);
    return { saleNumber, printedAt: new Date().toISOString(), items: rows.length, rows };
  },
};
