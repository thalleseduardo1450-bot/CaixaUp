const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../../src/services/api/productService.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness() {
  const calls = [];
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    assert.equal(name, "@/services/api/squareApi");
    return { squareApi: async (url, init = {}) => { calls.push({ url, init }); return { id: "ok" }; } };
  }});
  return { api: exports.productService, calls };
}

const payload = { productImageUrl: "", productImageName: "", productName: "Arroz", productCode: "123", productSupplier: "", productDescription: "", productQnt: "2", productUnitPrice: "5,00", productSalePrice: "7,00", totalPriceOnProduct: "7,00" };

test("product reads preserve active filter", async () => {
  const { api, calls } = harness();
  await api.list();
  await api.list({ includeInactive: true });
  assert.deepEqual(calls.map(({ url }) => url), ["/products?includeInactive=false", "/products?includeInactive=true"]);
});

test("product writes use encoded scoped routes", async () => {
  const { api, calls } = harness();
  await api.create(payload);
  await api.update("id com espaço", payload);
  await api.restore("id/1");
  await api.remove("id/2");
  assert.deepEqual(calls.map(({ url, init }) => [url, init.method]), [["/products", "POST"], ["/products/id%20com%20espa%C3%A7o", "PUT"], ["/products/id%2F1/restore", "PUT"], ["/products/id%2F2", "DELETE"]]);
  assert.deepEqual(JSON.parse(calls[0].init.body), payload);
});
