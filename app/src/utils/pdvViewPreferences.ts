/**
 * Arquivo: src/utils/pdvViewPreferences.ts
 * Objetivo: preferências visuais e de conforto da frente de caixa.
 * Entradas esperadas: valores escolhidos pelo operador na própria tela do PDV.
 *
 * Separado de pdvPreferences.ts de propósito: aquele arquivo guarda preferências
 * que mudam REGRA de venda (como vender sem estoque) e é lido também
 * pela tela de Configurações. Aqui ficam só preferências de APARÊNCIA, que o
 * operador troca no meio do expediente sem consequência fiscal.
 */
import type { PdvDensity, PdvProductViewMode } from "@/types/pdv";

export const PDV_VIEW_MODE_KEY = "horus-pdv-view-mode";
export const PDV_DENSITY_KEY = "horus-pdv-density";
export const PDV_SOUND_KEY = "horus-pdv-sound-enabled";
export const PDV_FAVORITES_KEY = "horus-pdv-favorites";
export const PDV_COLUMNS_KEY = "horus-pdv-grid-columns";

const VALID_VIEW_MODES: PdvProductViewMode[] = [
  "grade",
  "lista",
  "favoritos",
  "mais-vendidos",
];

function readString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeString(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage indisponível: a preferência vale só para esta sessão */
  }
}

/* ---------------------- modo de exibição ---------------------- */

export function getViewMode(): PdvProductViewMode {
  const stored = readString(PDV_VIEW_MODE_KEY);
  if (stored && VALID_VIEW_MODES.includes(stored as PdvProductViewMode)) {
    return stored as PdvProductViewMode;
  }
  return "grade";
}

export function setViewMode(mode: PdvProductViewMode): void {
  writeString(PDV_VIEW_MODE_KEY, mode);
}

/* ---------------------- densidade ---------------------- */

export function getDensity(): PdvDensity {
  return readString(PDV_DENSITY_KEY) === "compacta" ? "compacta" : "confortavel";
}

export function setDensity(density: PdvDensity): void {
  writeString(PDV_DENSITY_KEY, density);
}

/* ---------------------- som de leitura ---------------------- */

export function getSoundEnabled(): boolean {
  // Padrão ligado: o bipe é a principal confirmação de que o item entrou
  // quando o operador está olhando para o produto, não para a tela.
  return readString(PDV_SOUND_KEY) !== "false";
}

export function setSoundEnabled(enabled: boolean): void {
  writeString(PDV_SOUND_KEY, String(enabled));
}

/* ---------------------- colunas da grade ---------------------- */

export function getGridColumns(): number {
  const stored = Number(readString(PDV_COLUMNS_KEY));
  if (Number.isFinite(stored) && stored >= 2 && stored <= 6) return stored;
  return 3;
}

export function setGridColumns(columns: number): void {
  writeString(PDV_COLUMNS_KEY, String(Math.min(6, Math.max(2, columns))));
}

/* ---------------------- favoritos ---------------------- */

export function getFavoriteIds(): string[] {
  try {
    const raw = readString(PDV_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function toggleFavoriteId(productId: string): string[] {
  const current = getFavoriteIds();
  const next = current.includes(productId)
    ? current.filter((id) => id !== productId)
    : [...current, productId];
  writeString(PDV_FAVORITES_KEY, JSON.stringify(next));
  return next;
}

/* ---------------------- produtos mais usados ---------------------- */

export const PDV_USAGE_KEY = "horus-pdv-usage-count";
/** Trava de tamanho: guarda só os campeões, senão o mapa cresce para sempre. */
const MAX_TRACKED_PRODUCTS = 120;

export type PdvUsageMap = Record<string, number>;

/**
 * Contador local de "quantas vezes este produto foi lançado neste terminal".
 * Fica no navegador de propósito: o mais vendido da loja não é o mais vendido
 * deste caixa. Quem trabalha no caixa da padaria quer o pão na frente, não o
 * campeão de vendas do mercado inteiro.
 */
export function getUsageCounts(): PdvUsageMap {
  try {
    const raw = readString(PDV_USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as PdvUsageMap;
  } catch {
    return {};
  }
}

export function registerProductUsage(productId: string, times = 1): PdvUsageMap {
  const counts = getUsageCounts();
  counts[productId] = (counts[productId] ?? 0) + times;

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const trimmed: PdvUsageMap = {};
  for (const [id, count] of entries.slice(0, MAX_TRACKED_PRODUCTS)) {
    trimmed[id] = count;
  }

  writeString(PDV_USAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}
