const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Só as funções puras da busca; o resto do hook depende de React e da API.
const source = fs.readFileSync(path.join(__dirname, "../../src/hooks/Pdv/usePdvProducts.ts"), "utf8");
const inicio = source.indexOf("/** Minúscula e sem acento");
const fim = source.indexOf("export type PdvProductsFilter");
const trecho = `const COMBINING_MARKS = /[\\u0300-\\u036f]/g;\n${source.slice(inicio, fim)}`;
const code = ts.transpileModule(trecho, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = {};
vm.runInNewContext(code, { exports: modulo });
const { normalizeSearchText, prefixRank } = modulo;

/** Filtra como o PDV (cada palavra tem de aparecer) e ordena pelo prefixo. */
function buscar(nomes, termo) {
  const q = normalizeSearchText(termo);
  return nomes
    .filter((nome) => q.split(/\s+/).every((t) => normalizeSearchText(nome).includes(t)))
    .sort((a, b) => prefixRank(a, q) - prefixRank(b, q));
}

const catalogo = ["Arroz Tio João", "Açúcar Cristal", "Leite Condensado", "Café Pilão", "Chocolate Garoto", "Biscoito Recheado", "Coca-Cola 2L"];

test("digitar 'c' traz primeiro quem começa com C", () => {
  const resultado = buscar(catalogo, "c");
  const primeiros = resultado.slice(0, 3);
  assert.deepEqual(primeiros.sort(), ["Café Pilão", "Chocolate Garoto", "Coca-Cola 2L"].sort());
  // Quem só contém "c" no meio fica para depois.
  assert.ok(resultado.indexOf("Leite Condensado") > 2);
  assert.ok(resultado.indexOf("Biscoito Recheado") > 2);
});

test("palavra do meio vem antes de quem só contém", () => {
  // "Leite Condensado" tem uma palavra que começa com "cond"; os outros não.
  assert.equal(prefixRank("Leite Condensado", "cond"), 1);
  assert.equal(prefixRank("Condimento", "cond"), 0);
  assert.equal(prefixRank("Arroz", "rr"), 2);
});

test("acento não atrapalha: 'acucar' acha e prioriza 'Açúcar'", () => {
  const resultado = buscar(catalogo, "acucar");
  assert.deepEqual(resultado, ["Açúcar Cristal"]);
  assert.equal(prefixRank("Açúcar Cristal", "acu"), 0);
});

test("dentro do mesmo grupo a ordem original é mantida", () => {
  const nomes = ["Cebola", "Alface", "Cenoura", "Batata"];
  assert.deepEqual(buscar(nomes, "c"), ["Cebola", "Cenoura", "Alface"]);
});
