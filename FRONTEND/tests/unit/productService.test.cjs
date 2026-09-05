const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../../src/services/api/productService.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const payload = {
  productName: 'Produto teste', productCode: '123', productSalePrice: '12,50',
  productDescription: '', productQnt: '', productUnitPrice: '', productSupplier: '',
  productImageUrl: '', productImageName: '', totalPriceOnProduct: '',
};

function fixture(error = null, company = 'company-test') {
  const writes = [];
  const filters = [];
  const chain = {
    insert(data) { writes.push(data); return this; },
    update(data) { writes.push(data); return this; },
    select() { return this; },
    eq(...args) { filters.push(args); return this; },
    async single() { return { data: { id: 'product-test', ...writes.at(-1), estoque_atual: writes.at(-1).estoque_atual ?? 7 }, error }; },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({ supabase: { from: () => chain }, currentCompanyId: async () => company }),
  });
  return { service: exports.productService, writes, filters };
}

test('creates with optional fields empty and stock/cost zero', async () => {
  const f = fixture();
  const saved = await f.service.create(payload);
  assert.equal(saved.productSalePrice, '12,50');
  assert.equal(f.writes[0].estoque_atual, 0);
  assert.equal(f.writes[0].preco_custo, 0);
  assert.equal(f.writes[0].descricao, '');
});

test('blank quantity on edit preserves existing stock and scopes company', async () => {
  const f = fixture();
  await f.service.update('product-test', payload);
  assert.equal('estoque_atual' in f.writes[0], false);
  assert.ok(f.filters.some(([field, value]) => field === 'empresa_id' && value === 'company-test'));
});

test('explicit zero stock is saved and formatted amounts are parsed', async () => {
  const f = fixture();
  await f.service.update('product-test', { ...payload, productQnt: '0', productUnitPrice: '1.234,56' });
  assert.equal(f.writes[0].estoque_atual, 0);
  assert.equal(f.writes[0].preco_custo, 1234.56);
});

test('invalid prices and quantities never reach the database', async () => {
  for (const invalid of [{ productUnitPrice: '-1' }, { productUnitPrice: 'abc' }, { productSalePrice: 'Infinity' }, { productQnt: '-1' }, { productQnt: 'abc' }, { productSalePrice: '' }]) {
    const f = fixture();
    await assert.rejects(() => f.service.create({ ...payload, ...invalid }));
    assert.equal(f.writes.length, 0);
  }
});

test('database errors produce actionable messages', async () => {
  for (const [code, expected] of [['23505', /Já existe/], ['42501', /permissão/], ['PGRST116', /confirmar/], ['22003', /rejeitou/]]) {
    const f = fixture({ code });
    await assert.rejects(() => f.service.create(payload), expected);
  }
});

test('network uncertainty does not trigger a duplicate save', async () => {
  const f = fixture({ message: 'Failed to fetch' });
  await assert.rejects(() => f.service.create(payload), /verificar se o produto foi registrado/);
  assert.equal(f.writes.length, 1);
});

test('missing company blocks writes', async () => {
  const f = fixture(null, null);
  await assert.rejects(() => f.service.create(payload), /empresa/);
  assert.equal(f.writes.length, 0);
});
