/**
 * Arquivo: src/utils/pdvProductSearch.ts
 * Objetivo: busca de produtos da frente de caixa, com ordem de relevância.
 *
 * Por que existe: a busca antiga devolvia os produtos em ordem alfabética e a
 * tela mostrava só os 80 primeiros. Quem digitava "leite" numa loja com 150
 * itens de leite não via o produto que queria e achava que ele não existia.
 * Agora o que mais se parece com o digitado vem primeiro:
 *   0. código igual ao bipado/digitado
 *   1. nome começa com o texto digitado, ou código começa com os números
 *   2. cada palavra digitada é começo de uma palavra do nome ("lei int")
 *   3. cada palavra digitada aparece no nome
 *   4. o resto (código no meio, fornecedor)
 * Dentro de cada grupo vale a ordem alfabética do catálogo.
 */
import type { PdvProduct } from "@/types/pdv";
import { productCodeKeys } from "@/utils/productCode";

/**
 * Bloco de acentos combinantes (U+0300–U+036F) que o NFD separa da letra base.
 * Montado via RegExp com escape em vez de literal: acento solto no código-fonte
 * é ilegível na revisão e desaparece em qualquer editor que renormalize o arquivo.
 */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Minúscula e sem acento, para "cafe" achar "Café" e "AÇÚCAR" achar "acucar". */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

/** Só letras e números: "coca-cola 2 L" vira "cocacola2l". */
function compactText(value: string): string {
  return value.replace(/[^a-z0-9]/g, "");
}

export type PdvSearchEntry = {
  product: PdvProduct;
  name: string;
  nameWords: string[];
  compactName: string;
  haystack: string;
  compactHaystack: string;
  codeKeys: string[];
};

export function buildSearchEntry(product: PdvProduct): PdvSearchEntry {
  const codes = [product.code, ...(product.alternateCodes ?? [])].filter(Boolean);
  const name = normalizeSearchText(product.name);
  const haystack = normalizeSearchText(
    `${product.name} ${codes.join(" ")} ${product.supplier ?? ""}`,
  );
  return {
    product,
    name,
    nameWords: name.split(/[^a-z0-9]+/).filter(Boolean),
    compactName: compactText(name),
    haystack,
    compactHaystack: compactText(haystack),
    codeKeys: Array.from(new Set(codes.flatMap((code) => productCodeKeys(code)))),
  };
}

/** Ordem do catálogo: alfabética em português, com "Item 2" antes de "Item 10". */
const catalogCollator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

export function sortCatalog(products: PdvProduct[]): PdvProduct[] {
  return [...products].sort((a, b) => catalogCollator.compare(a.name, b.name));
}

export type PdvSearchResult = {
  /** Os primeiros `limit` resultados, já em ordem de relevância. */
  items: PdvProduct[];
  /** Quantos produtos combinam no total (pode ser maior que items.length). */
  total: number;
};

const RANKS = 5;

export function searchCatalog(
  entries: PdvSearchEntry[],
  query: string,
  limit: number,
): PdvSearchResult {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return { items: [], total: 0 };

  const queryCodeKeys = new Set(productCodeKeys(query));
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const compactTokens = tokens.map(compactText);
  const compactQuery = compactText(normalizedQuery);
  const queryIsNumeric = /^\d+$/.test(compactQuery);

  const buckets: PdvProduct[][] = Array.from({ length: RANKS }, () => []);
  let total = 0;

  for (const entry of entries) {
    const rank = rankEntry(entry);
    if (rank < 0) continue;
    total += 1;
    buckets[rank].push(entry.product);
  }

  const items: PdvProduct[] = [];
  for (const bucket of buckets) {
    for (const product of bucket) {
      if (items.length >= limit) break;
      items.push(product);
    }
    if (items.length >= limit) break;
  }
  return { items, total };

  function rankEntry(entry: PdvSearchEntry): number {
    if (entry.codeKeys.some((key) => queryCodeKeys.has(key))) return 0;

    // Cada palavra digitada precisa aparecer em algum lugar; com ou sem
    // pontuação ("cocacola" acha "Coca-Cola", "2l" acha "2 L").
    const everyTokenMatches = tokens.every(
      (token, index) =>
        entry.haystack.includes(token) ||
        entry.compactHaystack.includes(compactTokens[index]),
    );
    if (!everyTokenMatches) return -1;

    if (entry.name.startsWith(normalizedQuery)) return 1;
    if (compactQuery && entry.compactName.startsWith(compactQuery)) return 1;
    if (
      queryIsNumeric &&
      compactQuery.length >= 3 &&
      entry.codeKeys.some((key) => key.startsWith(compactQuery))
    ) {
      return 1;
    }

    if (
      tokens.every((token, index) =>
        entry.nameWords.some(
          (word) => word.startsWith(token) || word.startsWith(compactTokens[index]),
        ),
      )
    ) {
      return 2;
    }

    if (
      tokens.every(
        (token, index) =>
          entry.name.includes(token) || entry.compactName.includes(compactTokens[index]),
      )
    ) {
      return 3;
    }

    return 4;
  }
}
