const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/services/api/customerService.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(result = []) {
  const calls = [];
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    assert.equal(name, "@/services/api/squareApi");
    return { squareApi: async (url, init = {}) => { calls.push({ url, init }); return result; } };
  }});
  return { api: exports.customerService, calls };
}

const payload = { customerName: "Cliente", document: "", birthDate: "", age: "", cep: "", city: "", state: "", address: "", neighborhood: "", streetComplement: "", number: "", referencePoint: "", telephone: "", cellphone: "", email: "" };

test("customer list uses the PostgreSQL API", async () => {
  const { api, calls } = harness([{ id: "1" }]);
  assert.equal((await api.list())[0].id, "1");
  assert.equal(calls[0].url, "/customers");
});

test("customer writes preserve empty optional fields", async () => {
  const { api, calls } = harness();
  await api.create(payload);
  await api.update("id/1", payload);
  await api.remove("id/2");
  assert.deepEqual(calls.map(({ url, init }) => [url, init.method]), [["/customers", "POST"], ["/customers/id%2F1", "PUT"], ["/customers/id%2F2", "DELETE"]]);
  assert.equal(JSON.parse(calls[0].init.body).document, "");
});
