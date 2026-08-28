const SCANNER_PREFIX = /^\][a-z]\d/i;
const BARCODE_CACHE_KEY = "caixaup.barcode.catalog.v1";

export type BarcodeCatalogInfo = {
  code: string;
  name: string;
  brand: string;
  quantity: string;
};

function numericVariants(value: string): string[] {
  const digits = value.replace(/\D/g, "");
  if (!digits) return [];

  const variants = new Set<string>([digits, digits.replace(/^0+(?=\d)/, "")]);
  if (digits.length === 12) variants.add(`0${digits}`);
  if (digits.length === 13 && digits.startsWith("0")) variants.add(digits.slice(1));
  if (digits.length === 14 && digits.startsWith("0")) {
    variants.add(digits.slice(1));
    if (digits.startsWith("00")) variants.add(digits.slice(2));
  }
  return [...variants].filter(Boolean);
}

export function barcodeLookupValue(value: string): string | null {
  const clean = value.normalize("NFKC").trim().replace(SCANNER_PREFIX, "");
  const runs: string[] = clean.match(/\d{8,18}/g) ?? [];
  const compactDigits = clean.replace(/\D/g, "");
  if (compactDigits.length >= 8) runs.push(compactDigits);
  const selected = runs.sort((left, right) => {
    const leftDistance = Math.abs(left.length - 13);
    const rightDistance = Math.abs(right.length - 13);
    return leftDistance - rightDistance || right.length - left.length;
  })[0];
  if (!selected) return null;
  if (selected.length <= 14) return selected.replace(/^0+(?=\d{8,14}$)/, "");
  const gtin = selected.match(/(?:^|01)(\d{14})(?:\D|$)/)?.[1];
  return gtin ?? selected.slice(-14).replace(/^0+(?=\d{8,14}$)/, "");
}

export function productCodeKeys(value: string): string[] {
  const withoutScannerPrefix = value.normalize("NFKC").trim().replace(SCANNER_PREFIX, "");
  if (!withoutScannerPrefix) return [];

  const compact = withoutScannerPrefix.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact) return [];

  const keys = new Set([compact]);
  for (const variant of numericVariants(compact)) keys.add(variant);
  const lookupValue = barcodeLookupValue(withoutScannerPrefix);
  if (lookupValue) {
    for (const variant of numericVariants(lookupValue)) keys.add(variant);
  }

  return [...keys];
}

export function roundedBarcodePrefix(value: string): string | null {
  const digits = barcodeLookupValue(value);
  if (!digits) return null;
  const significant = digits.replace(/^0+/, "");
  const prefix = significant.replace(/0{5,}$/, "");
  return prefix !== significant && prefix.length >= 6 && prefix.length <= 8 ? prefix : null;
}

function identityTokens(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/(\d)([a-z])/gi, "$1 $2")
      .replace(/([a-z])(\d)/gi, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2),
  );
}

export function scoreProductIdentity(productName: string, info: BarcodeCatalogInfo): number {
  const productTokens = identityTokens(productName);
  const catalogTokens = identityTokens(`${info.name} ${info.brand} ${info.quantity}`);
  let score = 0;
  for (const token of productTokens) {
    if (!catalogTokens.has(token)) continue;
    score += /^\d+$/.test(token) ? 12 : token.length >= 4 ? 5 : 3;
  }
  return score;
}

function readCatalogCache(): Record<string, BarcodeCatalogInfo> {
  try {
    return JSON.parse(window.localStorage.getItem(BARCODE_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

export async function lookupBarcodeCatalog(value: string): Promise<BarcodeCatalogInfo | null> {
  const code = barcodeLookupValue(value);
  if (!code || code.length < 8 || code.length > 14) return null;
  const cache = readCatalogCache();
  if (cache[code]) return cache[code];

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,quantity`,
      { signal: controller.signal },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload?.status !== 1 || !payload.product) return null;
    const info: BarcodeCatalogInfo = {
      code,
      name: String(payload.product.product_name || ""),
      brand: String(payload.product.brands || ""),
      quantity: String(payload.product.quantity || ""),
    };
    if (!info.name && !info.brand) return null;
    cache[code] = info;
    window.localStorage.setItem(BARCODE_CACHE_KEY, JSON.stringify(cache));
    return info;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function productCodesMatch(left: string, right: string): boolean {
  const rightKeys = new Set(productCodeKeys(right));
  return productCodeKeys(left).some((key) => rightKeys.has(key));
}
