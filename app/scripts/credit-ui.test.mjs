// Exercises actual PaymentsPage, dialogs and local-sales service in an isolated browser.
// No application server, real customer storage or Supabase access is used.
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const result = await build({ configFile:false, build: { write:false, minify:false, rollupOptions:{ input:path.join(root,'scripts/credit-ui.fixture.tsx'), output:{ manualChunks:undefined, inlineDynamicImports:true } } }, plugins:[{name:'isolated-services',enforce:'pre',resolveId(id){if(id==='@/utils/authStorage')return '\0fixture-auth';if(id==='@/services/api/squareApi')return '\0fixture-api';},load(id){if(id==='\0fixture-auth')return 'export function getStoredAuthUser(){return {companyId:"test",id:"test",name:"Operador Teste"}}';if(id==='\0fixture-api')return `const key='caixaup.credit-ui.test'; const read=()=>JSON.parse(localStorage.getItem(key)||'[]'); const write=(rows)=>{localStorage.setItem(key,JSON.stringify(rows));return rows[0]}; export async function squareApi(path,options={}){const rows=read();if(path==='/credit-sales')return rows;const sale=rows[0];const body=JSON.parse(options.body||'{}');if(path.endsWith('/quantities')){sale.items.forEach((item,index)=>item.quantity=body.quantities[index]);sale.totalCents=sale.items.reduce((sum,item)=>sum+Math.round(item.unitPrice*item.quantity*100),0)-sale.discountCents;sale.openCents=sale.totalCents-sale.paidCents;sale.revision=String(Number(sale.revision)+1);return write(rows)}if(path.endsWith('/receipts')){const amount=body.payments.reduce((sum,payment)=>sum+payment.amountCents,0);sale.receipts.push({id:body.requestId,paidAt:new Date().toISOString(),operatorName:'Teste',payments:body.payments});sale.paidCents+=amount;sale.openCents-=amount;sale.revision=String(Number(sale.revision)+1);return write(rows)}throw new Error('Rota não simulada: '+path)}`;}}] });
const output = (Array.isArray(result) ? result[0] : result).output;
const bundle = output.find((o)=>o.type==='chunk' && o.isEntry).code;
const css = readFileSync(path.join(root,'dist/assets', readdirSync(path.join(root,'dist/assets')).find((f)=>f.endsWith('.css'))),'utf8');
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext({viewport:{width:1180,height:800},reducedMotion:'reduce'});
 const key='caixaup.credit-ui.test';
 const sample={id:'s',saleNumber:'1',customerName:'Cliente de teste com nome longo para validar a tela',customerCpf:'teste',saleDate:'2026-09-01T12:00:00.000Z',items:[{productId:'p',productCode:'123',productName:'Produto teste',quantity:10,unitPrice:10}],discountCents:0,totalCents:10000,paidCents:0,openCents:10000,initialPaidCents:0,legacyPaidCents:0,receipts:[],revision:'1'};
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
   if(url.origin==='http://localhost:47891' && url.pathname==='/') return route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>'});
   if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css});
   if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:bundle});
   return route.abort();
 });
 await context.addInitScript(({key,sample})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify([sample]));},{key,sample});
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://localhost:47891');
 await page.getByRole('button',{name:'Abrir / Receber'}).click();
 await page.getByLabel('Valor em Pix',{exact:true}).fill('40,00');
 await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key))[0].receipts?.length??0,key),0);
 await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar recebimento',exact:true}).click();
 await page.getByText('Pix: R$ 40,00',{exact:true}).waitFor();
 await page.getByLabel('Quantidade de Produto teste').fill('3');
 assert.equal(await page.getByRole('button',{name:'Salvar quantidades',exact:true}).isDisabled(),true);
 await page.getByLabel('Quantidade de Produto teste').fill('8');
 assert.equal(await page.getByLabel('Valor em Pix',{exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Salvar quantidades',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Salvar quantidades',exact:true}).click();
 await page.getByLabel('Valor em Crédito',{exact:true}).fill('20,00');
 await page.getByLabel('Valor em Débito',{exact:true}).fill('20,00');
 await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar recebimento',exact:true}).click();
 await page.getByText('Esta venda está quitada.',{exact:false}).waitFor();
 for(const width of [1180,768,390]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`horizontal overflow ${width}`);
 }
 await page.reload();await page.getByLabel('Incluir quitados').check();await page.getByRole('button',{name:'Abrir / Receber'}).click();
 await page.getByText('Esta venda está quitada.',{exact:false}).waitFor();
 const rows=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 assert.equal(rows[0].items[0].quantity,8);assert.equal(rows[0].paidCents,8000);assert.equal(rows[0].receipts.length,2);assert.deepEqual(errors,[]);
 console.log('PASS: cancel, partial Pix, quantity validation/edit, mixed debit/credit, persisted paid history and 1180/768/390 widths.');
} finally {await browser.close();}
