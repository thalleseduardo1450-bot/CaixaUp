import { squareApi } from "@/services/api/squareApi";
import type { PdvCartItem, PdvSuspendedSale } from "@/types/pdv";

export const suspendedSalesService = {
  list: () => squareApi<PdvSuspendedSale[]>("/suspended-sales"),
  async suspend(items: PdvCartItem[], sale: Omit<PdvSuspendedSale, "id" | "suspendedAt" | "items" | "totalCents">) {
    await squareApi("/suspended-sales", { method: "POST", body: JSON.stringify({ ...sale, items }) });
  },
  resume: (id: string) => squareApi<PdvSuspendedSale>(`/suspended-sales/${encodeURIComponent(id)}/resume`, { method: "POST" }),
  discard: (id: string) => squareApi<void>(`/suspended-sales/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
