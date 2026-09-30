import { squareApi } from "@/services/api/squareApi";
import { getStoredAuthUser } from "@/utils/authStorage";

export type HomeKpiDto = { label: string; value: string; helper: string; color: string; trend: number[] };
type DashboardSnapshot = { cards: HomeKpiDto[]; savedAt: number };
const pending = new Map<string, Promise<DashboardSnapshot>>();

function storageKey() {
  const user = getStoredAuthUser();
  return user?.id && user.companyId
    ? `caixaup.dashboard.v1:${user.companyId}:${user.id}`
    : null;
}

function validSnapshot(value: unknown): value is DashboardSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as DashboardSnapshot;
  return Number.isFinite(snapshot.savedAt) && snapshot.savedAt <= Date.now()
    && new Date(snapshot.savedAt).toDateString() === new Date().toDateString()
    && Array.isArray(snapshot.cards) && snapshot.cards.length <= 10
    && snapshot.cards.every((card) => card && typeof card.label === "string"
      && typeof card.value === "string" && typeof card.helper === "string"
      && typeof card.color === "string" && card.color.length <= 64
      && Array.isArray(card.trend) && card.trend.length <= 366 && card.trend.every(Number.isFinite));
}

export const homeService = {
  snapshot(): DashboardSnapshot | null {
    try {
      const key = storageKey();
      const value: unknown = key ? JSON.parse(window.localStorage.getItem(key) || "null") : null;
      return validSnapshot(value) ? value : null;
    } catch { return null; }
  },
  get(): Promise<DashboardSnapshot> {
    const key = storageKey();
    if (!key) return Promise.reject(new Error("Entre novamente para carregar os indicadores."));
    const existing = pending.get(key);
    if (existing) return existing;
    const request = squareApi<{ cards: HomeKpiDto[] }>("/dashboard").then((result) => {
      const snapshot = { cards: result.cards, savedAt: Date.now() };
      if (!validSnapshot(snapshot)) throw new Error("O servidor retornou indicadores inválidos.");
      if (key === storageKey()) {
        try { window.localStorage.setItem(key, JSON.stringify(snapshot)); } catch {}
      }
      return snapshot;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  },
};
