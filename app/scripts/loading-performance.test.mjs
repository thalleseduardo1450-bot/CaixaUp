import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/services/api/squareApi.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replace(/import\.meta\.env\.VITE_SQUARE_API_URL/g, '"https://api.test"') + '\nexport { migrateLegacyData, scheduleLegacyMigration };', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const products = Array.from({ length: 2101 }, (_, index) => ({ id: String(index), nome: `Produto ${index}` }));
let user = { id: "user", companyId: "company" };
const storage = new Map();
const timers = [];
const requests = [];
let reads = 0;
const context = {
  exports: {}, Headers, performance, console, structuredClone, AbortSignal,
  require: (name) => name.includes("authStorage") ? { getStoredAuthUser: () => user } : { supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) },
    from: (table) => {
      const query = { select: () => query, eq: () => query, order: () => query, range: async (from, to) => {
        reads++;
        const rows = table === "produtos" ? products : [{ id: "customer", nome: "Cliente" }];
        return { data: rows.slice(from, Math.min(to + 1, from + 1000)), count: rows.length, error: null };
      } };
      return query;
    },
  } },
  window: {
    setTimeout: (callback) => { timers.push(callback); return timers.length; }, clearTimeout: () => {},
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  },
  fetch: async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, body });
    if (body?.products) assert.ok(body.products.length <= 250);
    if (body?.customers) assert.equal(requests.filter((entry) => entry.body?.products).flatMap((entry) => entry.body.products).length, 2101);
    return { ok: true, status: 200, json: async () => ({ cards: [] }) };
  },
};
vm.runInNewContext(compiled, context);
await context.exports.squareApi("/dashboard");
assert.equal(reads, 0, "Dashboard must not wait for legacy reads");
assert.equal(requests.length, 1);
user = null;
timers.shift()();
assert.equal(reads, 0, "Scheduled migration must stop after logout");
user = { id: "user", companyId: "company" };
await context.exports.migrateLegacyData("token");
const migrated = requests.filter((entry) => entry.body?.products).flatMap((entry) => entry.body.products);
assert.equal(migrated.length, 2101);
assert.equal(new Set(migrated.map((entry) => entry.id)).size, 2101);
const count = requests.length;
await context.exports.migrateLegacyData("token");
assert.equal(requests.length, count, "Completed migration must not run again");
console.log("PASS: dashboard without migration wait; logout; 2101 products without loss; accepted batch sizes; dependency order; no repeat.");
const beforeShared = requests.length;
const shared = await Promise.all(Array.from({ length: 10 }, () => context.exports.squareApi("/products")));
assert.equal(requests.length - beforeShared, 1, "Concurrent identical reads must use one request");
shared[0].cards.push("changed");
assert.equal(shared[1].cards.length, 0, "Consumers must not share mutable responses");
await context.exports.squareApi("/products");
assert.equal(requests.length - beforeShared, 2, "Completed reads must refresh");
const beforeWrites = requests.length;
await Promise.all([0, 1].map(() => context.exports.squareApi("/sales", { method: "POST", body: "{}" })));
assert.equal(requests.length - beforeWrites, 2, "Writes must never be merged");
console.log("PASS: ten concurrent reads use one request; independent results; fresh subsequent reads; separate writes.");
context.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Invalid JSON"); } });
await assert.rejects(context.exports.squareApi("/sales", { method: "POST", body: "{}" }), /Resposta inválida/);
let readSignal;
context.fetch = async (_url, init) => { readSignal = init.signal; return { ok: true, status: 200, json: async () => ({}) }; };
await context.exports.squareApi("/products");
assert.ok(readSignal instanceof AbortSignal, "Reads must have a time limit");
await context.exports.squareApi("/sales", { method: "POST", body: "{}" });
assert.equal(readSignal, undefined, "Writes must not time out silently or be retried automatically");
console.log("PASS: invalid success responses rejected; read timeout present; financial writes not automatically interrupted.");
