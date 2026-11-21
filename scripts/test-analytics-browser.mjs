// Dedicated T3 check. Starts only a disposable local database and preview.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const port = Number(process.env.ANALYTICS_TEST_PORT || 3343);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const base = `http://localhost:${port}`;
const token = randomBytes(32).toString('hex');
const server = spawn(process.execPath, ['scripts/dev-preview.mjs', String(port)], {
  cwd: new URL('../', import.meta.url), windowsHide: true,
  env: { ...process.env, ADMIN_TOKEN: token, ADMIN_EMAIL: 'admin@preview.test', PREVIEW_WEBPACK: '1', NEXT_DIST_DIR: `.next-analytics-${port}` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '', browser;
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-60000); });
const errors = [];
try {
  const deadline = Date.now() + 120000;
  while (true) {
    if (server.exitCode !== null) throw new Error('Preview exited: ' + logs.replaceAll(token, '[preview token]'));
    try { if ((await fetch(base + '/admin/login')).ok) break; } catch {}
    assert.ok(Date.now() < deadline, 'isolated preview became ready');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch(process.env.ANALYTICS_BROWSER_CHANNEL ? { channel: process.env.ANALYTICS_BROWSER_CHANNEL } : {});
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '/admin/login');
  await page.getByLabel('Admin email').fill('admin@preview.test');
  await page.getByLabel('Admin password').fill(token);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(base + '/admin');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + '/admin/analytics');
    await expect(page.getByRole('heading', { level: 1, name: 'Analytics', exact: true })).toBeVisible();
    await expect(page.getByText('We could not load this page', { exact: false })).toHaveCount(0);
    const cards = page.locator('[data-kpi]');
    await expect(cards).toHaveCount(12);
    for (const label of ['Revenue', 'Orders', 'Average order value', 'New customers', 'Returning customers', 'Refunds', 'Failed payments', 'Pending payments', 'Discount given', 'Downloads', 'Offer redemptions']) {
      await expect(page.locator(`[data-kpi="${label}"] svg polyline`)).toHaveCount(1);
    }
    await page.waitForFunction(() => [...document.querySelectorAll('canvas')].length >= 7 && [...document.querySelectorAll('canvas')].every(c => c.width > 0 && c.height > 0 && c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0)));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no page overflow at ${width}px`);
    // The rendering check above verifies ink on the actual canvases.
    const charts = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas[aria-label="Revenue and orders over time"]');
      return { combo: canvas.dataset.chartKind };
    });
    assert.equal(charts.combo, 'combo');
    await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
    const screenshot = fileURLToPath(new URL(`../artifacts/analytics-${width}.png`, import.meta.url));
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log('Analytics screenshot:', screenshot);
  }
  await page.getByRole('link', { name: 'Compare to previous period' }).click();
  await expect(page).toHaveURL(/compare=0/);
  await page.getByRole('link', { name: 'Last 90 days', exact: true }).click();
  await expect(page.getByText('Weekly totals, Monday to Sunday.', { exact: true })).toBeVisible();
  await page.goto(base + '/admin/analytics?from=2001-01-01&to=2001-01-01');
  await expect(page.getByText('No orders in this range', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply custom range' })).toBeEnabled();
  await page.goto(base + '/admin/analytics?from=2026-99-99&to=2026-11-21');
  await expect(page.getByRole('heading', { level: 1, name: 'Analytics', exact: true })).toBeVisible();
  const csv = await page.request.get(new URL(await page.getByRole('link', { name: 'Export CSV' }).getAttribute('href'), base).href);
  assert.equal(csv.status(), 200);
  assert.match(await csv.text(), /order_id,name,email/);
  assert.deepEqual(errors, [], 'no browser exceptions or console errors');
  console.log('Analytics browser checks passed: authenticated route, 12 KPI trends, canvases at 1440/390, combo, no overflow, comparison, weekly, empty/malformed ranges, CSV.');
} catch (error) {
  console.error('Analytics preview diagnostics:', logs.replaceAll(token, '[preview token]'));
  throw error;
} finally {
  await browser?.close();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else server.kill('SIGTERM');
}
