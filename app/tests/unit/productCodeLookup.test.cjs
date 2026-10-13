const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const transpile = (source) =>
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

// productCode.ts inteiro (só usa window dentro das funções de rede).
const productCode = {};
vm.runInNewContext(transpile(fs.readFileSync(path.join(__dirname, "../../src/utils/productCode.ts"), "utf8")), { exports: productCode });

// Só a função pura que escolhe o produto pelo código bipado.
const source = fs.readFileSync(path.join(__dirname, "../../src/hooks/Pdv/usePdvProducts.ts"), "utf8");
const inicio = source.indexOf("export function findProductByCode");
const fim = source.indexOf("/** O nome do produto e o do catálogo");
const modulo = {};
vm.runInNewContext(transpile(source.slice(inicio, fim)), { exports: modulo, productCodeKeys: productCode.productCodeKeys });
const { findProductByCode } = modulo;

const produto = (id, code, stock = 5, alternateCodes = []) => ({ id, name: id, code, alternateCodes, stock, unitPriceCents: 100, imageUrl: "" });

test("acha pelo código de barras com e sem zero à esquerda", () => {
  const lista = [produto("arroz", "7891234567895")];
  assert.equal(findProductByCode(lista, "7891234567895")?.id, "arroz");
  assert.equal(findProductByCode(lista, "07891234567895")?.id, "arroz");
  assert.equal(findProductByCode(lista, " 7891234567895 ")?.id, "arroz");
});

test("acha pelo código interno (alternativo)", () => {
  const lista = [produto("feijao", "7890000000017", 5, ["123"])];
  assert.equal(findProductByCode(lista, "123")?.id, "feijao");
});

test("código que não existe não devolve nada", () => {
  assert.equal(findProductByCode([produto("arroz", "7891234567895")], "7899999999999"), null);
});

test("com cadastro duplicado, prefere o que tem estoque", () => {
  const lista = [produto("antigo", "7891234567895", 0), produto("novo", "7891234567895", 10)];
  assert.equal(findProductByCode(lista, "7891234567895")?.id, "novo");
});

test("com cadastro duplicado, prefere o código idêntico ao bipado", () => {
  const lista = [produto("sem-zero", "7891234567895"), produto("com-zero", "07891234567895")];
  assert.equal(findProductByCode(lista, "07891234567895")?.id, "com-zero");
});
