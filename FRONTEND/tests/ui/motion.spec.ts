import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// Exercise real components without accessing accounts, sales or payment services.
async function mount(page: Page, body: string) {
  const fixtureName = `.generated-${randomUUID()}.tsx`;
  const fixturePath = path.join(process.cwd(), "tests", "ui", fixtureName);
  writeFileSync(fixturePath, `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import '../../src/index.css';
    import AppSplash from '../../src/components/Loading/AppSplash';
    import { useStatusDialog } from '../../src/hooks/Dialog/useStatusDialog';
    import Reveal from '../../src/components/Reveal';
    import PageLayout from '../../src/layout/PageLayout';
    const h = React.createElement;
    ${body}
    createRoot(document.getElementById('root')!).render(h(React.StrictMode, null, h(Harness)));
    (window as Window & { __UI_MOUNTED__?: boolean }).__UI_MOUNTED__ = true;`);
  page.on("pageerror", error => console.error(error.message));
  await page.route("**/__ui_test__", route => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/tests/ui/${fixtureName}');
      </script></body></html>`,
  }));
  page.once("close", () => rmSync(fixturePath, { force: true }));
  await page.goto("/__ui_test__");
  await page.waitForFunction(() => (window as Window & { __UI_MOUNTED__?: boolean }).__UI_MOUNTED__ === true);
}

test("splash completes despite parent rerenders during exit", async ({ page }) => {
  await mount(page, `function Harness() {
    const [tick, setTick] = React.useState(0);
    const [done, setDone] = React.useState(false);
    React.useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 60); return () => clearInterval(id); }, []);
    return done ? h('p', null, 'Ready') : h(AppSplash, { ready: tick > 2, onFinished: () => setDone(true) });
  }`);
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 10000 });
});

test("reduced motion skips the splash delay", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(page, `function Harness() {
    const [done, setDone] = React.useState(false);
    return done ? h('p', null, 'Ready') : h(AppSplash, { ready: true, onFinished: () => setDone(true) });
  }`);
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
});

test("splash waits for the opening to play even when the app is already ready", async ({ page }) => {
  await mount(page, `function Harness() {
    const [done, setDone] = React.useState(false);
    return done ? h('p', null, 'Ready') : h(AppSplash, { ready: true, onFinished: () => setDone(true) });
  }`);
  // A abertura tem 7,8 s: pronto não basta, tem de tocar.
  await expect(page.getByRole("status", { name: "Preparando CaixaUp" })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.getByText("Ready", { exact: true })).toBeHidden();
});

test("the skip button ends the opening at once", async ({ page }) => {
  await mount(page, `function Harness() {
    const [done, setDone] = React.useState(false);
    return done ? h('p', null, 'Ready') : h(AppSplash, { ready: true, onFinished: () => setDone(true) });
  }`);
  const opening = page.frameLocator('iframe[title="Abertura animada CaixaUp"]');
  const skip = opening.getByRole("button", { name: "Pular" });
  await expect(skip).toBeVisible({ timeout: 10000 });
  await skip.click();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 3000 });
});

const dialogHarness = `function Harness() {
  const first = useStatusDialog(); const second = useStatusDialog();
  const [result, setResult] = React.useState('Pending');
  return h('div', { style: { transform: 'translateY(20px)' } },
    h('button', { onClick: async () => setResult(String(await first.confirm('Fechar o caixa atual?', { cancelLabel: 'Continuar no caixa', confirmLabel: 'Fechar caixa' }))) }, 'Open'),
    h('button', { onClick: () => { void first.confirm('First').then(v => setResult('First:' + v)); void second.confirm('Second'); } }, 'Both'),
    h('p', null, result), first.Dialog, second.Dialog);
}`;

for (const width of [320, 1024, 1366]) {
  test(`dialog fits ${width}px, traps focus and cancels safely`, async ({ page }) => {
    await page.setViewportSize({ width, height: 768 });
    await mount(page, dialogHarness);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Continuar no caixa" })).toBeFocused();
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(768);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("false", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open", exact: true })).toBeFocused();
  });
}

test("dialog resolvers are isolated between hook instances", async ({ page }) => {
  await mount(page, dialogHarness);
  await page.getByRole("button", { name: "Both", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "First", exact: true }).getByRole("button", { name: "Sim", exact: true }).click();
  await expect(page.getByText("First:true", { exact: true })).toBeVisible();
});

test("tall reveal becomes visible and stays visible after scrolling", async ({ page }) => {
  await mount(page, `function Harness() { return h(Reveal, null, h('section', { style: { height: '10000px' } }, 'Tall content')); }`);
  await expect(page.locator(".reveal")).toHaveCSS("opacity", "1");
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".reveal")).toHaveCSS("opacity", "1");
});

test("collapsed sidebar retains its 80px width in compact mode", async ({ page }) => {
  await mount(page, `function Harness() {
    React.useEffect(() => { document.documentElement.dataset.fitSmallScreens = 'true'; }, []);
    return h('aside', { 'data-app-sidebar': true, 'data-collapsed': 'true', className: 'w-20' }, 'Sidebar');
  }`);
  await expect(page.locator("aside")).toHaveCSS("width", "80px");
});

test("page remains readable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(page, `function Harness() { return h(PageLayout, null, h('section', null, 'Cash summary')); }`);
  await expect(page.getByText("Cash summary")).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("finished page animations do not trap fixed overlays", async ({ page }) => {
  await mount(page, `function Harness() { return h('div', { className: 'page-enter' }, h('div', { className: 'card-in' }, 'Page')); }`);
  await expect(page.locator('.page-enter')).toHaveCSS('transform', 'none');
  await expect(page.locator('.card-in')).toHaveCSS('transform', 'none');
});

test("cash register screen and confirmation fit 1024x768", async ({ page }, testInfo) => {
  await page.route("**/*.supabase.co/**", route => route.abort());
  await mount(page, `
    const { cashRegisterService } = await import('/src/services/api/cashRegisterService.ts');
    const { default: CashRegisterPage } = await import('/src/pages/Admin/CashRegisterPage.tsx');
    const session = { id: 'ui-fixture', status: 'aberto', openedAt: '2026-09-05T10:00:00Z', openingAmount: '100,00', closingAmount: '0,00', operatorName: 'Operador de teste', closedByName: '', note: '', elapsedMinutes: 120 };
    cashRegisterService.status = async () => ({ state: 'aberto', canSell: true, blockReason: '', currentSession: session, history: [session] });
    cashRegisterService.summary = async () => ({ saleCount: 0, itemCount: 0, totalSales: 0, totalReceived: 0, paymentTotals: {}, products: [] });
    cashRegisterService.close = async () => { throw new Error('Financial writes prohibited in UI tests'); };
    function Harness() {
      React.useEffect(() => { document.documentElement.dataset.fitSmallScreens = 'true'; }, []);
      return h('div', { className: 'flex h-screen' },
        h('aside', { 'data-app-sidebar': true, 'data-collapsed': 'true', className: 'w-20 shrink-0' }, 'CaixaUp'),
        h('main', { 'data-active-page': 'caixa', className: 'flex-1 min-w-0 overflow-y-auto' }, h(CashRegisterPage)));
    }
  `);
  await page.getByRole("button", { name: "Fechar caixa", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1024);
  expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("cash-register-1024.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "Continuar no caixa" }).click();
  await expect(dialog).toHaveCount(0);
});
