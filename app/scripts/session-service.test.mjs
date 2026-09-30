import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let userResult = { data: { user: { id: 'account' } }, error: null };
let signOutError = null;
const calls = [];
const client = { auth: {
  getUser: async () => userResult,
  signOut: async options => { calls.push(options.scope); return { error: signOutError }; },
} };
const source = readFileSync(new URL('../src/services/api/sessionService.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, require: () => ({ supabase: client }), window: { caixaUpDesktop: {} }, navigator: { userAgent: 'Windows' } };
vm.runInNewContext(compiled, context);
const { sessionService } = context.exports;
const sessions = await sessionService.list();
assert.equal(sessions.length, 1);
assert.equal(sessions[0].current, true);
assert.equal(sessions[0].device, 'CaixaUp neste computador');
await sessionService.terminateOthers();
assert.deepEqual(calls, ['others']);
signOutError = new Error('Network unavailable');
await assert.rejects(() => sessionService.terminateOthers(), /Network unavailable/);
userResult = { data: { user: null }, error: new Error('Session expired') };
await assert.rejects(() => sessionService.list(), /Session expired/);
console.log('Session service: current session, others scope and errors passed.');
