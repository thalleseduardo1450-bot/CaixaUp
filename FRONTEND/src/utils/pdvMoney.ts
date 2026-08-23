/**
 * Arquivo: src/utils/pdvMoney.ts
 * Objetivo: tratar dinheiro na frente de caixa como número inteiro de centavos.
 * Entradas esperadas: valores em reais (float ou texto pt-BR) vindos da API e dos inputs.
 *
 * POR QUE CENTAVOS?
 * Number em JavaScript é ponto flutuante. 0.1 + 0.2 dá 0.30000000000000004.
 * Somando item por item num carrinho, o total erra centavos — e aí o operador
 * precisa "distribuir R$ 0,00" que nunca fecha. Guardando tudo como inteiro
 * (R$ 12,34 vira 1234) a conta é exata e a comparação é `===`, sem epsilon.
 * A conversão para reais acontece só na borda: ao ler da API e ao exibir.
 */

/** Converte reais (float) para centavos inteiros. 12.34 -> 1234 */
export function toCents(reais: number): number {
  if (!Number.isFinite(reais)) return 0;
  return Math.round(reais * 100);
}

/** Converte centavos inteiros para reais (float). 1234 -> 12.34 */
export function toReais(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return cents / 100;
}

/**
 * Lê um texto pt-BR ("1.234,56") em centavos, sem passar por float intermediário.
 * Aceita também "1234,5", "1234", "R$ 12,34".
 */
export function parseCentsBr(text: string | null | undefined): number {
  if (!text) return 0;
  const digitsOnly = String(text).replace(/[^\d]/g, "");
  if (!digitsOnly) return 0;

  const hasComma = String(text).includes(",");
  if (!hasComma) {
    // Sem vírgula: tratamos os dígitos como reais inteiros ("1234" = R$ 1.234,00).
    return Number(digitsOnly) * 100;
  }

  // Com vírgula: os dois últimos dígitos após a vírgula são os centavos.
  const [inteira = "", decimal = ""] = String(text).split(",");
  const reaisPart = inteira.replace(/[^\d]/g, "") || "0";
  const centsPart = (decimal.replace(/[^\d]/g, "") + "00").slice(0, 2);
  return Number(reaisPart) * 100 + Number(centsPart);
}

/**
 * Lê o texto de um input com máscara de moeda onde o operador digita da direita
 * para a esquerda (padrão de PDV: teclar 1-2-3-4 resulta em R$ 12,34).
 */
export function parseTypedCents(text: string | null | undefined): number {
  if (!text) return 0;
  const digitsOnly = String(text).replace(/[^\d]/g, "");
  if (!digitsOnly) return 0;
  return Number(digitsOnly.slice(0, 12));
}

/** Formata centavos como "1.234,56" (sem o prefixo R$). */
export function formatCents(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const negative = safe < 0;
  const absolute = Math.abs(safe);
  const reaisPart = Math.floor(absolute / 100);
  const centsPart = String(absolute % 100).padStart(2, "0");
  const grouped = reaisPart.toLocaleString("pt-BR");
  return `${negative ? "-" : ""}${grouped},${centsPart}`;
}

/** Formata centavos como "R$ 1.234,56". */
export function formatCentsBrl(cents: number): string {
  return `R$ ${formatCents(cents)}`;
}

/**
 * Lê o campo de preço que a API devolve como texto pt-BR e entrega centavos.
 * A API do Hórus guarda dinheiro em NVARCHAR ("0,00"), por isso a normalização.
 */
export function centsFromApi(apiValue: string | null | undefined): number {
  return parseCentsBr(apiValue);
}

/**
 * Prepara o valor para enviar de volta à API, que espera texto pt-BR sem "R$".
 */
export function centsToApi(cents: number): string {
  return formatCents(cents);
}

/**
 * Reparte um valor em centavos entre N formas de pagamento sem perder centavo.
 * Usado quando o operador pede "dividir igual entre 3": 1000 centavos em 3 vira
 * [334, 333, 333] — a sobra vai para a primeira parcela, e a soma continua exata.
 */
export function splitCentsEvenly(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

/** Cédulas e moedas em circulação, em centavos, da maior para a menor. */
export const CASH_DENOMINATIONS_CENTS = [
  20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5,
] as const;

/**
 * Sugere como montar o troco com o menor número de cédulas/moedas.
 * Serve para o operador conferir a gaveta rápido: "1x R$ 20, 1x R$ 5, 2x R$ 0,25".
 */
export function suggestChangeBreakdown(
  changeCents: number,
): Array<{ valueCents: number; count: number }> {
  let remaining = Math.max(0, Math.round(changeCents));
  const breakdown: Array<{ valueCents: number; count: number }> = [];

  for (const denomination of CASH_DENOMINATIONS_CENTS) {
    if (remaining < denomination) continue;
    const count = Math.floor(remaining / denomination);
    remaining -= count * denomination;
    breakdown.push({ valueCents: denomination, count });
  }

  return breakdown;
}
