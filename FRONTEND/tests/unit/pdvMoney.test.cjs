const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../../src/utils/pdvMoney.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const money = {};
vm.runInNewContext(compiled, { exports: money });

test('payment input treats whole numbers as reais and decimals as optional', () => {
  assert.equal(money.parseTypedCents('10'), 1000);
  assert.equal(money.parseTypedCents('10,50'), 1050);
  assert.equal(money.parseTypedCents('10.50'), 1050);
});
