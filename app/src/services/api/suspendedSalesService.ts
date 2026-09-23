import type { PdvCartItem, PdvSuspendedSale } from "@/types/pdv";
import { listSuspendedSales, removeSuspendedSale, suspendSale } from "@/utils/pdvDrafts";

export const suspendedSalesService = {
  async list(): Promise<PdvSuspendedSale[]> {
    return listSuspendedSales();
  },
  async suspend(items: PdvCartItem[], sale: Omit<PdvSuspendedSale, "id" | "suspendedAt" | "items" | "totalCents">) {
    const totalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    if (!suspendSale({ ...sale, items, totalCents })) throw new Error("Não foi possível guardar a venda neste computador.");
  },
  async resume(id: string): Promise<PdvSuspendedSale> {
    const sale = listSuspendedSales().find((entry) => entry.id === id);
    if (!sale) throw new Error("Venda suspensa não encontrada neste computador.");
    removeSuspendedSale(id);
    return sale;
  },
  async discard(id: string) {
    removeSuspendedSale(id);
  },
};
