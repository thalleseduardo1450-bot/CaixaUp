const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/services/api/salesHistoryService.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(response = { saleNumber: "1", saleId: "sale-id", total: 1, replayed: false }) {
  const calls = [];
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    assert.equal(name, "@/services/api/squareApi");
    return { squareApi: async (url, init = {}) => { calls.push({ url, init }); return response; } };
  }});
  return { api: exports.salesHistoryService, calls };
}

test("credit quantity and receipt writes keep revision and idempotency", async () => {
  const { api, calls } = harness();
  await api.updateCreditQuantities({ saleId: "venda/1", revision: "r1", quantities: [2] });
  await api.receiveCreditPayment({ saleId: "venda/1", revision: "r2", requestId: "req", payments: [{ forma: "pix", amountCents: 500 }] });
  assert.deepEqual(calls.map(({ url, init }) => [url, init.method]), [["/credit-sales/venda%2F1/quantities", "PUT"], ["/credit-sales/venda%2F1/receipts", "POST"]]);
  assert.equal(JSON.parse(calls[1].init.body).requestId, "req");
});

test("registration rejects incomplete acknowledgements", async () => {
  for (const response of [null, {}, { saleNumber: "1", saleId: "", total: 1, replayed: false }]) {
    await assert.rejects(harness(response).api.register({ requestId: "same-id" }), /não confirmou/);
  }
});

test("sale history and registration use server routes", async () => {
  const { api, calls } = harness();
  const payload = { requestId: "req", customerName: "Consumidor", customerCpf: "-", paymentType: "dinheiro", totalAmount: "1,00", operatorName: "Teste", items: [] };
  await api.list();
  await api.listCreditSales();
  await api.listCreditDebts();
  await api.register(payload);
  await api.print("10/2");
  assert.deepEqual(calls.map(({ url }) => url), ["/sales", "/credit-sales", "/credit-debts", "/sales", "/sales/10%2F2/print"]);
});
