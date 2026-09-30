import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/services/api/homeService.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const storage = new Map();
let user = { id: "one", companyId: "company" };
let release;
let requests = 0;
const context = {
  exports: {},
  require: (name) => name.includes("authStorage") ? { getStoredAuthUser: () => user } : {
    squareApi: () => { requests++; return new Promise((resolve) => { release = resolve; }); },
  },
  window: { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
};
vm.runInNewContext(compiled, context);
const service = context.exports.homeService;
const card = { label: "Vendas hoje", value: "8", helper: "vendas concluídas", color: "#2563EB", trend: [1, 2] };
const key = "caixaup.dashboard.v1:company:one";
storage.set(key, JSON.stringify({ cards: [card], savedAt: Date.now() }));
const request = service.get();
assert.equal(service.get(), request);
assert.equal(requests, 1);
assert.equal(service.snapshot().cards[0].value, "8", "Cached indicators must be available before the network responds");
release({ cards: [{ ...card, value: "9" }] });
await request;
assert.equal(service.snapshot().cards[0].value, "9");
user = { id: "two", companyId: "other" };
assert.equal(service.snapshot(), null, "No cross-account cache");
const late = service.get();
user = null;
release({ cards: [card] });
await late;
assert.equal(storage.has("caixaup.dashboard.v1:other:two"), false, "Do not save responses after logout");
user = { id: "one", companyId: "company" };
storage.set(key, JSON.stringify({ cards: [card], savedAt: Date.now() - 86400000 }));
assert.equal(service.snapshot(), null, "Yesterday's totals are not today's totals");
storage.set(key, "broken");
assert.equal(service.snapshot(), null);
storage.set(key, JSON.stringify({ cards: [{}], savedAt: Date.now() }));
assert.equal(service.snapshot(), null);
console.log("PASS: synchronous cached indicators while network is pending; refresh; request sharing; account isolation; logout; date rollover; corrupt cache.");
