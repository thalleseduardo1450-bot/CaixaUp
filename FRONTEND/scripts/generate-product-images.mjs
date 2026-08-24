import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import XLSX from "@e965/xlsx";

const source = resolve(process.argv[2] || "C:/Users/Administrator/Downloads/produto.xls");
const outputDir = resolve(process.argv[3] || "public/product-images");
const manifestPath = join(outputDir, ".product-images.json");
const colors = ["#2563eb", "#0891b2", "#059669", "#7c3aed", "#db2777", "#ea580c"];

function fileName(name, code) {
  const identity = `${code.trim()}|${name.trim()}`;
  let hash = 0x811c9dc5;
  for (const character of identity) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}.png`;
}

const workbook = XLSX.read(readFileSync(source), { type: "buffer", cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
const headers = rows[0].map((cell) => String(cell).trim().toLowerCase());
const nameColumn = headers.findIndex((header) => header === "nome" || header === "produto");
const codeColumn = headers.findIndex((header) => header === "código" || header === "codigo");

if (nameColumn < 0 || codeColumn < 0) {
  throw new Error("As colunas Nome e Código não foram encontradas.");
}

mkdirSync(outputDir, { recursive: true });
const products = [];

for (const row of rows.slice(1)) {
  const name = String(row[nameColumn] ?? "").trim();
  const code = String(row[codeColumn] ?? "").trim();
  if (!name || !code) continue;

  const hash = [...`${name}|${code}`].reduce((total, character) => total + character.charCodeAt(0), 0);
  products.push({
    name: name.slice(0, 28),
    code,
    initial: name.charAt(0).toUpperCase() || "P",
    color: colors[hash % colors.length],
    file: fileName(name, code),
  });
}

writeFileSync(manifestPath, JSON.stringify(products));
const scriptDir = dirname(fileURLToPath(import.meta.url));
const result = spawnSync("pwsh", [
  "-NoProfile",
  "-File",
  join(scriptDir, "render-product-images.ps1"),
  "-Manifest",
  manifestPath,
  "-OutputDirectory",
  outputDir,
], { encoding: "utf8" });
rmSync(manifestPath, { force: true });
if (result.status !== 0) throw new Error(result.stderr || "Falha ao gerar PNGs.");
console.log(result.stdout.trim());
console.log(`Pasta: ${outputDir}`);
console.log(`Fonte: ${basename(source)}`);
