const BACKUP_KEYS = [
  "caixaup.local-sales.v1:",
  "caixaup.local-sale-number.v1:",
  "horus-pdv-draft:",
  "horus-pdv-suspended:",
];

type BackupPayload = {
  format: "caixaup-local-backup";
  version: 1;
  createdAt: string;
  entries: Array<{ key: string; value: string }>;
};

function allowedKey(key: string) {
  return BACKUP_KEYS.some((prefix) => key.startsWith(prefix));
}

export function createLocalBackup(): BackupPayload {
  const entries: BackupPayload["entries"] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !allowedKey(key)) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) entries.push({ key, value });
  }
  return { format: "caixaup-local-backup", version: 1, createdAt: new Date().toISOString(), entries };
}

export function downloadLocalBackup() {
  const blob = new Blob([JSON.stringify(createLocalBackup(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `caixaup-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function restoreLocalBackup(text: string) {
  if (text.length > 25_000_000) throw new Error("O arquivo de backup é muito grande.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Arquivo de backup inválido.");
  }
  if (!value || typeof value !== "object" || (value as BackupPayload).format !== "caixaup-local-backup" || (value as BackupPayload).version !== 1) throw new Error("Arquivo de backup inválido.");
  const entries = (value as BackupPayload).entries;
  if (!Array.isArray(entries) || entries.length > 100) throw new Error("Backup incompatível.");
  const keys = new Set<string>();
  let totalSize = 0;
  for (const entry of entries) {
    if (!entry || typeof entry.key !== "string" || typeof entry.value !== "string" || !allowedKey(entry.key) || entry.value.length > 5_000_000 || keys.has(entry.key)) throw new Error("Backup contém dados inválidos.");
    keys.add(entry.key);
    totalSize += entry.value.length;
    if (totalSize > 20_000_000) throw new Error("Backup excede o limite permitido.");
    try {
      JSON.parse(entry.value);
    } catch {
      throw new Error("Backup contém dados inválidos.");
    }
  }
  for (const entry of entries) window.localStorage.setItem(entry.key, entry.value);
  return entries.length;
}
