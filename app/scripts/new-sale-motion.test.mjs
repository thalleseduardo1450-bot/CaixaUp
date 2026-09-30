import { build } from 'vite';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const fixture = `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import SaleSuccessModal from '@/components/Admin/SaleSuccessModal';
import '@/index.css';
const receipt={saleNumber:'3',items:[{id:'item',name:'Produto',quantity:1,unitPrice:14.99,total:14.99}],subtotal:14.99,total:14.99,cashGiven:14.99,change:0,paymentLabel:'Dinheiro R$ 14,99'};
function Fixture(){const [completed,setCompleted]=useState(0);return <><output aria-label="Conclusões">{completed}</output>{completed?<input aria-label="Pesquisar produto" autoFocus/>:<SaleSuccessModal receipt={receipt} formatMoney={value=>value.toFixed(2)} onPrint={()=>{}} onStartNewSale={()=>setCompleted(value=>value+1)}/>}</>}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`;
const result = await build({
  configFile:false,
  resolve:{alias:{'@':fileURLToPath(new URL('../src',import.meta.url))}},
  plugins: [react(), tailwindcss(), { name:'motion-fixture', resolveId(id) { if (id === 'virtual:motion-fixture') return '\0motion-fixture.tsx'; }, load(id) { if (id === '\0motion-fixture.tsx') return fixture; } }],
  build: { write:false, minify:false, rollupOptions:{ input:'virtual:motion-fixture', output:{ manualChunks:undefined, inlineDynamicImports:true } } },
});
const output = (Array.isArray(result) ? result[0] : result).output;
const bundle = output.find(entry => entry.type === 'chunk' && entry.isEntry).code;
const css = output.filter(entry => entry.type === 'asset' && entry.fileName.endsWith('.css')).map(entry => entry.source).join('\n');
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1000,height:750}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/fixture.js') return route.fulfill({contentType:'text/javascript',body:bundle});
    if (pathname === '/style.css') return route.fulfill({contentType:'text/css',body:css});
    return route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>'});
  });
  for (const trigger of ['click','enter','reduced']) {
    await page.emulateMedia({reducedMotion:trigger === 'reduced' ? 'reduce' : 'no-preference'});
    await page.goto('http://localhost:47892');
    await page.getByRole('button',{name:'Nova venda',exact:true}).waitFor();
    if (trigger === 'click') {
      await page.locator('.sale-confirmation').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
      await page.screenshot({path:'../desktop/release/sale-confirmation.png'});
      await page.getByRole('button',{name:'Ver detalhes'}).click();
      assert.equal(await page.getByRole('button',{name:'Ocultar'}).getAttribute('aria-expanded'),'true');
      await page.getByText('1 × Produto').waitFor();
      await page.setViewportSize({width:320,height:480});
      assert.equal(await page.locator('.sale-confirmation').evaluate(element => element.scrollWidth <= element.clientWidth),true);
      await page.getByRole('button',{name:'Nova venda',exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:'../desktop/release/sale-confirmation-mobile.png'});
      await page.getByRole('button',{name:'Ocultar'}).click();
      await page.setViewportSize({width:1000,height:750});
    }
    const started = Date.now();
    if (trigger === 'enter') await page.keyboard.press('Enter');
    else await page.getByRole('button',{name:'Nova venda',exact:true}).click();
    if (trigger !== 'reduced') {
      await page.getByRole('dialog',{name:'Preparando nova venda'}).waitFor();
      assert.equal(await page.getByLabel('Conclusões').textContent(),'0');
      for (let count = 0; count < 5; count += 1) await page.keyboard.press('Enter');
      if (trigger === 'click') {
        await page.waitForTimeout(400);
        await page.screenshot({path:'../desktop/release/new-sale-motion.png'});
      }
    }
    await page.getByLabel('Pesquisar produto').waitFor();
    assert.equal(await page.getByLabel('Conclusões').textContent(),'1');
    assert.equal(await page.getByLabel('Pesquisar produto').evaluate(element=>element===document.activeElement),true);
    if (trigger !== 'reduced') assert.ok(Date.now()-started >= 1100);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: click, Enter, repeated keys, completion once, search focus and reduced motion.');
} finally { await browser.close(); }
