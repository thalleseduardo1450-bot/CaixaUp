const SCANNER_PREFIX = /^\][a-z]\d/i;

export function productCodeKeys(value: string): string[] {
  const withoutScannerPrefix = value.trim().replace(SCANNER_PREFIX, "");
  if (!withoutScannerPrefix) return [];

  const compact = withoutScannerPrefix.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact) return [];

  const keys = new Set([compact]);
  if (/^\d{8,18}$/.test(compact)) {
    keys.add(compact.replace(/^0+(?=\d)/, ""));
  }

  return [...keys];
}

export function productCodesMatch(left: string, right: string): boolean {
  const rightKeys = new Set(productCodeKeys(right));
  return productCodeKeys(left).some((key) => rightKeys.has(key));
}
