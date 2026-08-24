/**
 * Arquivo: src/utils/pdvPreferences.ts
 * Objetivo: centraliza preferências locais da frente de caixa.
  * Entradas esperadas: recebe preferências locais do PDV e centraliza leitura/gravação no navegador.
*/
export const SELL_WITHOUT_STOCK_STORAGE_KEY = "horus-pdv-sell-without-stock";

export function getSellWithoutStockEnabled() {
  try {
    return window.localStorage.getItem(SELL_WITHOUT_STOCK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSellWithoutStockEnabled(enabled: boolean) {
  window.localStorage.setItem(SELL_WITHOUT_STOCK_STORAGE_KEY, String(enabled));
  window.dispatchEvent(
    new CustomEvent("horus-pdv-sell-without-stock-change", { detail: { enabled } }),
  );
}
