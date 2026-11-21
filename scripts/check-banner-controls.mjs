import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import sharp from 'sharp';
import { checkCrop } from './browser-crop-check.mjs';

const base = process.env.PREVIEW_URL || 'http://localhost:3300';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only isolated local previews may be tested.');
assert.match(process.env.ADMIN_TOKEN || '', /^[a-f0-9]{64}$/, 'Pass the isolated preview ADMIN_TOKEN.');
const expect = baseExpect.configure({ timeout: Number(process.env.EXPECT_TIMEOUT || 40000) });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource.*(?:400|404)/.test(m.text())) errors.push(m.text()); });
page.on('dialog', d => d.accept());
const stamp = Date.now();
const image = 'https://banner-fixture.invalid/banner.png';
const fixture = await sharp({ create: { width: 1600, height: 600, channels: 3, background: '#236852' } }).png().toBuffer();
await context.route('https://banner-fixture.invalid/**', route => route.fulfill({ contentType: 'image/png', body: fixture }));
async function visit(path) { await page.goto(base + path, { waitUntil: 'networkidle' }); }
async function saveSection(key, values = {}) {
  await visit('/admin/banners/sections/' + key);
  for (const [name, value] of Object.entries(values)) {
    const field = page.locator('[name="' + name + '"]');
    if (await field.evaluate(e => e.tagName === 'SELECT')) await field.selectOption(String(value));
    else await field.fill(String(value));
  }
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(/saved=1/);
}
async function addBanner(key, title, extra = {}) {
  const response = await page.request.post(base + '/api/admin/platform/content', {
    headers: { Origin: base }, form: { section: 'modules', action: 'save', type: 'banner', title,
      placement: key, image_url: image, status: 'published', sort: '0', ...extra }, maxRedirects: 0,
  });
  assert.equal(response.status(), 303, await response.text());
  assert.ok(!String(response.headers().location).includes('error='), 'Banner save refused');
}
const section = key => page.locator('[data-section="' + key + '"]');
try {
  await visit('/admin/login');
  await page.getByLabel('Admin email').fill(process.env.ADMIN_EMAIL || 'admin@preview.test');
  await page.getByLabel('Admin password').fill(process.env.ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(base + '/admin');
  await visit('/search');
  const productPath = await page.locator('a[href^="/products/"], a[href^="/books/"]').first().getAttribute('href');
  assert.ok(productPath, 'Preview must have a seeded product');
  await visit('/admin/banners/sections/new');
  const positions = await page.locator('select[name="position"] option').evaluateAll(options => options.map(o => o.value));
  assert.equal(positions.length, 8);
  const keys = [];
  // 1. Every position is saved through the admin UI and rendered on its actual page.
  for (const [i, position] of positions.entries()) {
    const key = 't4-' + stamp + '-' + i;
    keys.push(key);
    await visit('/admin/banners/sections/new');
    await page.locator('[name="title"]').fill('T4 ' + i);
    await page.locator('[name="key"]').fill(key);
    await page.locator('[name="position"]').selectOption(position);
    await page.getByRole('button', { name: 'Add section', exact: true }).click();
    await expect(page).toHaveURL(/saved=1/);
    await addBanner(key, 'T4 art ' + i);
    await visit(position.startsWith('home-') ? '/' : position.startsWith('listing-') ? '/search' : productPath);
    await expect(section(key)).toBeVisible();
    await expect(section(key)).toHaveAttribute('data-position', position);
  }
  console.log('PASS 1: all eight banner positions');
  const key = keys[positions.indexOf('home-after-categories')];
  await addBanner(key, 'T4 second');
  await addBanner(key, 'T4 third');
  // 2. Layout and responsive columns.
  await saveSection(key, { layout: 'grid', columns: 3, max: 3 });
  await visit('/');
  const columns = () => section(key).evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  assert.equal(await columns(), 3);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await columns(), 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS 2: grid has three desktop columns and one phone column');
  // 3, 4, 5. Real CSS custom properties and rendered count.
  await saveSection(key, { width: 1000, height: 1000, fit: 'contain', max: 2 });
  await visit('/');
  await expect(section(key)).toHaveAttribute('style', /--ratio:\s*1000\s*\/\s*1000/);
  await expect(section(key)).toHaveAttribute('style', /--fit:\s*contain/);
  await expect(section(key).locator('.banner-item')).toHaveCount(2);
  console.log('PASS 3–5: ratio, contain and max two');
  // 6. Disabled sections keep their banners and return on enabling.
  await saveSection(key, { enabled: 'off' });
  await visit('/'); await expect(section(key)).toHaveCount(0);
  await saveSection(key, { enabled: 'on' });
  await visit('/'); await expect(section(key).locator('.banner-item')).toHaveCount(2);
  console.log('PASS 6: disable and re-enable');
  // 7. Schedule entered in India time, shown as Scheduled, absent from store.
  const scheduledTitle = 'T4 scheduled ' + stamp;
  await addBanner(key, scheduledTitle, { publish_at: '2099-01-01T12:00', sort: '-10' });
  await visit('/admin/banners?q=' + encodeURIComponent(scheduledTitle));
  await expect(page.locator('tbody tr').filter({ hasText: scheduledTitle })).toContainText('Scheduled');
  await visit('/'); await expect(section(key).getByAltText(scheduledTitle)).toHaveCount(0);
  console.log('PASS 7: future banner scheduled and hidden');
  // 8. Confirm deletion and retain orphaned banner rows.
  const deletedKey = keys[0];
  await visit('/admin/banners/sections/' + deletedKey);
  await page.getByRole('button', { name: 'Delete section', exact: true }).click();
  await expect(page).toHaveURL(/saved=1/);
  await visit('/admin/banners?q=' + encodeURIComponent('T4 art 0'));
  await expect(page.locator('tbody tr').filter({ hasText: 'T4 art 0' })).toContainText('Section deleted');
  console.log('PASS 8: deleting section retains banner');
  await checkCrop({ page, context, base, key, fixture, expect });
  // 10. Reset a built-in override and compare its actual storefront properties.
  await visit('/admin/banners/sections/hero');
  const defaults = {};
  for (const name of ['width', 'height', 'layout', 'max', 'fit', 'enabled']) defaults[name] = await page.locator('[name="' + name + '"]').inputValue();
  await saveSection('hero', { width: 700, height: 700, layout: 'single', enabled: 'on' });
  await addBanner('hero', 'T4 hero ' + stamp);
  await visit('/'); await expect(section('hero')).toHaveAttribute('style', /--ratio:\s*700\s*\/\s*700/);
  await visit('/admin/banners/sections/hero');
  await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
  await expect(page).toHaveURL(/saved=1/);
  await visit('/');
  await expect(section('hero')).toHaveAttribute('style', new RegExp('--ratio:\\s*' + defaults.width + '\\s*\\/\\s*' + defaults.height));
  await expect(section('hero')).toHaveClass(new RegExp('layout-' + defaults.layout));
  assert.deepEqual(errors, [], 'No browser errors');
  console.log('PASS 10: built-in reset restores storefront defaults');
} finally { await browser.close(); }
console.log('Banner browser checks passed: all ten T4 acceptance scenarios.');
