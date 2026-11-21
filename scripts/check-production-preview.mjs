import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = process.env.PREVIEW_URL;
assert.ok(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const expect = baseExpect.configure({ timeout: 40000 });
const browser = await chromium.launch();
const page = await browser.newPage();
// The preceding banner acceptance test stores this provider fixture only in its disposable DB.
await page.route('https://banner-fixture.invalid/**', route => route.fulfill({
  contentType: 'image/svg+xml',
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600"><rect width="1600" height="600" fill="#236852"/></svg>',
}));
page.setDefaultNavigationTimeout(120000);
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await mkdir('artifacts', { recursive: true });
try {
  await page.goto(base + '/admin/login');
  await page.getByLabel('Admin email').fill(process.env.ADMIN_EMAIL || 'admin@preview.test');
  await page.getByLabel('Admin password').fill(process.env.ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(base + '/admin');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/admin/analytics', '/admin/banners', '/admin/banners/sections', '/admin/homepage', '/admin/theme', '/admin/seo', '/admin/storage', '/']) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, route);
      await expect(page.getByText('We could not load this page.', { exact: true })).toHaveCount(0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ' fits ' + width);
      if (route === '/admin/analytics') {
        await page.waitForFunction(() => [...document.querySelectorAll('canvas[role="img"]')].length >= 5 && [...document.querySelectorAll('canvas[role="img"]')].every(c => c.width > 0 && c.height > 0));
      }
      await page.screenshot({ path: 'artifacts/' + (route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')) + '-' + width + '.png', fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log('Production preview checks passed: admin routes, charts, screenshots and no overflow at 1440/390.');
} finally { await browser.close(); }
