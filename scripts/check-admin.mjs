import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const base = process.env.PREVIEW_URL || 'http://localhost:3100';
const token = process.env.ADMIN_TOKEN;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Admin checks must target the isolated preview.');
assert.match(token || '', /^[a-f0-9]{64}$/, 'Start the preview with ADMIN_TOKEN=<64 hex> and pass the same value here.');
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto(`${base}/admin/login`);
  await page.getByLabel('Admin email').fill(process.env.ADMIN_EMAIL || 'admin@preview.test');
  await page.getByLabel('Admin password').fill(token);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${base}/admin`);
  for (const [link, heading] of [['Orders', 'Orders'], ['Products', 'Products'], ['Categories', 'Categories'], ['Developers', 'Developers'],
    ['Collections', 'Collections'], ['Banners', 'Banners'], ['Homepage sections', 'Homepage sections'], ['Submissions', 'Submissions'], ['Delivery recovery', 'Delivery recovery']]) {
    await page.getByRole('navigation').getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  // Create a draft product: it opens straight in its editor.
  await page.goto(`${base}/admin/products`);
  await page.getByText('Add product').click();
  // The web address fills itself in from the name.
  const stamp = Date.now();
  const draftName = `Admin Check & Title ${stamp}`;
  const draft = `admin-check-and-title-${stamp}`;
  await page.getByLabel('Name').first().fill(draftName);
  await expect(page.getByLabel('Web address')).toHaveValue(draft);
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/products/${draft}\\?saved=1`));
  await expect(page.getByRole('heading', { level: 1, name: draftName })).toBeVisible();

  // Every detail saved in admin must show on the storefront product page.
  const slug = 'demo-auto-narration-in-vouchers';
  const store = `${base}/products/${slug}`;
  const editor = `${base}/admin/products/${slug}`;
  await page.goto(`${base}/admin/products`);
  await page.getByLabel('Search products').fill(slug);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator(`a[href="/admin/products/${slug}"][aria-label^="Edit"]`).click();
  await expect(page).toHaveURL(editor);
  const details = page.locator('form', { has: page.locator('input[name="action"][value="save"]') });
  await details.getByLabel('Name').fill('Auto Narration Pro');
  await details.getByLabel('Tagline').fill('Narrations written for you');
  await details.getByLabel('Regular price (₹)').fill('777');
  await details.getByLabel('Short description').fill('Sync check: short description from admin.');
  await details.getByLabel('About the product').fill('Sync check: long description from admin.');
  await details.getByLabel(/^Features/).fill('Sync feature one\nSync feature two');
  await details.getByLabel(/^Specifications/).fill('Compatible with: TallyPrime 5.x');
  await details.getByRole('button', { name: 'Update product' }).click();
  await expect(page).toHaveURL(`${editor}?saved=1`);
  await expect(page.getByText('Saved. The storefront now shows these changes.')).toBeVisible();
  await page.goto(store);
  await expect(page.getByRole('heading', { level: 1, name: 'Auto Narration Pro' })).toBeVisible();
  const html = await page.content();
  for (const text of ['Narrations written for you', '777', 'Sync check: short description from admin.', 'Sync check: long description from admin.',
    'Sync feature one', 'Sync feature two', 'Compatible with', 'TallyPrime 5.x']) assert.ok(html.includes(text), `store page shows "${text}"`);

  // A rejected save stays on the product and says so, instead of silently going elsewhere.
  await page.goto(editor, { waitUntil: 'networkidle' });
  await details.getByLabel(/^Specifications/).clear();
  await details.getByLabel(/^Specifications/).fill('no colon here');
  await details.getByRole('button', { name: 'Update product' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/products/${slug}\\?error=`));
  await expect(page.getByText('Not saved.')).toBeVisible();

  // Removing from the store hides the page; restoring brings it back.
  await page.goto(editor, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Remove from store' }).click();
  await expect(page).toHaveURL(`${editor}?saved=1`);
  expect((await page.request.get(store)).status()).toBe(404);
  await page.getByRole('button', { name: 'Restore to store' }).click();
  await expect(page).toHaveURL(`${editor}?saved=1`);
  expect((await page.request.get(store)).status()).toBe(200);

  // Bulk: select two rows, remove them from the store, then show them again.
  await page.goto(`${base}/admin/products?q=demo-auto`);
  const boxes = page.locator('tbody input[type="checkbox"]:not([disabled])');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Remove from store' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove from store' }).click();
  await expect(page.getByText(/Removed 2 products from the store/)).toBeVisible();
  expect((await page.request.get(store)).status()).toBe(404);
  await page.getByLabel('Select all products on this page').check();
  await page.getByRole('button', { name: 'Show in store' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Show in store' }).click();
  await expect(page.getByText(/Restored \d+ products? to the store/)).toBeVisible();
  expect((await page.request.get(store)).status()).toBe(200);
  // Banners are managed like products: a table with edit and delete, one page per banner, and sections that set layout and size.
  const saved = () => expect(page.getByText('Saved. The site is updated.')).toBeVisible();
  const newBanner = async (key) => {
    await page.goto(`${base}/admin/banners/new?section=${key}`, { waitUntil: 'networkidle' });
    return page.locator('form', { has: page.getByRole('button', { name: 'Add banner' }) });
  };
  const preset = async (form, name) => { await form.getByRole('button', { name }).first().click(); };
  const sectionForm = () => page.locator('form', { has: page.locator('input[name="max"]') });
  // A banner without an image is refused with a clear message, and the form comes back.
  let form = await newBanner('hero');
  await form.getByLabel('Name').fill('No image check');
  await form.getByRole('button', { name: 'Add banner' }).click();
  await expect(page.getByText(/Add an image for this banner/)).toBeVisible();
  // Hero: a live banner from a preset image, linked. A new banner returns to the table.
  form = await newBanner('hero');
  await expect(form.getByLabel('Section')).toHaveValue('hero');
  await preset(form, 'GST & E-Invoice');
  await form.getByLabel('Name').fill('Hero check');
  await form.getByLabel('Link when clicked (optional)').fill('/search');
  await form.getByRole('button', { name: 'Add banner' }).click();
  await expect(page).toHaveURL(/\/admin\/banners\?saved=1/);
  await saved();
  const bannerRow = (name) => page.locator('tr', { hasText: name });
  await expect(bannerRow('Hero check').getByText('Live', { exact: true })).toBeVisible();
  form = await newBanner('side');
  await expect(form.getByLabel('Section')).toHaveValue('side');
  await preset(form, 'Mega sale');
  await form.getByLabel('Name').fill('Side check');
  await form.getByRole('button', { name: 'Add banner' }).click();
  await saved();
  // Wide band that already ended: the homepage leaves it out, the table says Ended.
  form = await newBanner('band');
  await preset(form, 'Cloud & multi-branch');
  await form.getByLabel('Name').fill('Ended band check');
  await form.getByLabel('Name').fill('Ended band check');
  await form.getByLabel('Starts (India time, optional)').fill('2020-01-01T09:00');
  await form.getByLabel('Ends (India time, optional)').fill('2020-01-02T09:00');
  await form.getByRole('button', { name: 'Add banner' }).click();
  await saved();
  await expect(bannerRow('Ended band check').getByText('Ended', { exact: true })).toBeVisible();
  await page.goto(base, { waitUntil: 'networkidle' });
  const hero = page.locator('.home-main .banner-section');
  await expect(hero.locator('img[alt="Hero check"]')).toHaveCount(1);
  await expect(hero.locator('h1')).toHaveCount(0);
  await expect(hero.locator('a[href="/search"]')).toHaveCount(1);
  await expect(page.locator('.home-side img[alt="Side check"]')).toHaveAttribute('src', '/banners/mega-sale-promo.svg');
  await expect(page.locator('img[alt="Ended band check"]')).toHaveCount(0);

  // Edit a banner from its table row: rename it, change its status, and see both in the table and on the site.
  await page.goto(`${base}/admin/banners`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Edit Hero check' }).last().click();
  await expect(page).toHaveURL(/\/admin\/banners\/[^/]+$/);
  form = page.locator('form', { has: page.getByRole('button', { name: 'Save changes' }) });
  await form.getByLabel('Name').fill('Hero renamed');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await saved();
  await expect(page.getByRole('heading', { name: 'Hero renamed' })).toBeVisible();
  await form.getByLabel('Status').selectOption('draft');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await saved();
  await page.goto(`${base}/admin/banners`, { waitUntil: 'networkidle' });
  await expect(bannerRow('Hero renamed').getByText('Draft', { exact: true })).toBeVisible();
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.locator('img[alt="Hero renamed"]')).toHaveCount(0);
  // Delete one from the table (asks first), and another from its own page.
  await page.goto(`${base}/admin/banners`, { waitUntil: 'networkidle' });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete Hero renamed' }).click();
  await saved();
  await expect(bannerRow('Hero renamed')).toHaveCount(0);
  await page.getByRole('link', { name: 'Edit Side check' }).last().click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete banner' }).click();
  await expect(page).toHaveURL(/\/admin\/banners\?saved=1/);
  await expect(bannerRow('Side check')).toHaveCount(0);
  // The section filter narrows the table.
  await page.goto(`${base}/admin/banners?section=band`, { waitUntil: 'networkidle' });
  await expect(bannerRow('Ended band check')).toHaveCount(1);
  await page.goto(`${base}/admin/banners?q=nothing-like-this`, { waitUntil: 'networkidle' });
  await expect(page.getByText('No banners match this search.')).toBeVisible();

  // Sections: a table, with an edit page for layout, count, image size and fit.
  await page.goto(`${base}/admin/banners/sections`, { waitUntil: 'networkidle' });
  await expect(page.locator('tr', { hasText: 'Wide band' }).getByText('1920 × 500 px')).toBeVisible();
  await page.getByRole('link', { name: 'Edit Hero' }).last().click();
  await expect(page).toHaveURL(/\/admin\/banners\/sections\/hero$/);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Strip 4:1' }).click();
  await expect(page.locator('input[name="width"]')).toHaveValue('1600');
  await expect(page.locator('input[name="height"]')).toHaveValue('400');
  await page.locator('input[name="width"]').fill('1200');
  await page.locator('input[name="height"]').fill('600');
  await page.locator('select[name="layout"]').selectOption('single');
  await page.locator('select[name="fit"]').selectOption('contain');
  await expect(page.getByLabel('Layout preview')).toContainText('1200×600');
  await sectionForm().getByRole('button', { name: 'Save changes' }).click();
  await saved();
  await expect(page.locator('input[name="width"]')).toHaveValue('1200');
  // A bad number is refused with the reason, and nothing is saved.
  await page.locator('input[name="max"]').fill('99');
  await page.locator('input[name="max"]').evaluate((el) => el.removeAttribute('max'));
  await sectionForm().getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/max must be a whole number from 1 to 12/)).toBeVisible();
  await page.goto(`${base}/admin/banners/sections`, { waitUntil: 'networkidle' });
  await expect(page.locator('tr', { hasText: 'Hero' }).first().getByText('Built-in, customised')).toBeVisible();
  // The banner form now follows the section's size.
  await page.goto(`${base}/admin/banners/new?section=hero`, { waitUntil: 'networkidle' });
  await expect(page.getByText(/This section uses 1200 × 600 px/)).toBeVisible();
  // The storefront follows: shape from the size, fit from the setting.
  form = page.locator('form', { has: page.getByRole('button', { name: 'Add banner' }) });
  await preset(form, 'GST & E-Invoice');
  await form.getByLabel('Name').fill('Fit check');
  await form.getByRole('button', { name: 'Add banner' }).click();
  await saved();
  await page.goto(base, { waitUntil: 'networkidle' });
  const heroSection = page.locator('.home-main .banner-section.layout-single');
  await expect(heroSection).toHaveAttribute('style', /--ratio:\s*1200 \/ 600/);
  await expect(heroSection).toHaveAttribute('style', /--fit:\s*contain/);
  // Add a section of your own, give it a banner, and see it as a grid on the homepage.
  await page.goto(`${base}/admin/banners/sections/new`, { waitUntil: 'networkidle' });
  await page.locator('input[name="title"]').fill('Festival row');
  await page.locator('input[name="key"]').fill('festival-row');
  await page.locator('select[name="position"]').selectOption('home-after-products');
  await page.locator('select[name="layout"]').selectOption('grid');
  await sectionForm().getByRole('button', { name: 'Add section' }).click();
  await expect(page).toHaveURL(/\/admin\/banners\/sections\?saved=1/);
  await expect(page.locator('tr', { hasText: 'Festival row' }).getByText('Custom')).toBeVisible();
  form = await newBanner('festival-row');
  await expect(form.getByLabel('Section')).toHaveValue('festival-row');
  await preset(form, 'Mega sale');
  await form.getByLabel('Name').fill('Festival check');
  await form.getByRole('button', { name: 'Add banner' }).click();
  await saved();
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.locator('.banner-section.layout-grid img[alt="Festival check"]')).toHaveCount(1);
  // A key that would clash with a screen address is refused.
  await page.goto(`${base}/admin/banners/sections/new`, { waitUntil: 'networkidle' });
  await page.locator('input[name="title"]').fill('Bad key');
  await page.locator('input[name="key"]').fill('new');
  await sectionForm().getByRole('button', { name: 'Add section' }).click();
  await expect(page.getByText(/reserved/)).toBeVisible();
  // Reset the hero back to its defaults, and delete the custom section (its banner is kept and flagged).
  await page.goto(`${base}/admin/banners/sections/hero`, { waitUntil: 'networkidle' });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(page).toHaveURL(/\/admin\/banners\/sections\?saved=1/);
  await expect(page.locator('tr', { hasText: 'Hero' }).first().getByText('1920 × 600 px')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete Festival row' }).click();
  await saved();
  await expect(page.locator('tr', { hasText: 'Festival row' })).toHaveCount(0);
  await page.goto(`${base}/admin/banners`, { waitUntil: 'networkidle' });
  await expect(bannerRow('Festival check').getByText('Section deleted')).toBeVisible();

  // A scheduled banner keeps its start and end when reopened and saved again.
  form = await newBanner('hero');
  await preset(form, 'WhatsApp automation');
  await form.getByLabel('Name').fill('Schedule check');
  await form.getByLabel('Starts (India time, optional)').fill('2030-01-05T09:30');
  await form.getByLabel('Ends (India time, optional)').fill('2030-01-20T18:00');
  await form.getByRole('button', { name: 'Add banner' }).click();
  await saved();
  await expect(bannerRow('Schedule check').getByText('Scheduled', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Edit Schedule check' }).last().click();
  form = page.locator('form', { has: page.getByRole('button', { name: 'Save changes' }) });
  await expect(form.getByLabel('Starts (India time, optional)')).toHaveValue('2030-01-05T09:30');
  await expect(form.getByLabel('Ends (India time, optional)')).toHaveValue('2030-01-20T18:00');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await saved();
  await expect(page.locator('form', { has: page.getByRole('button', { name: 'Save changes' }) }).getByLabel('Starts (India time, optional)')).toHaveValue('2030-01-05T09:30');

  // New category: the web address follows the name; adding one with a taken address is refused, not overwritten.
  await page.goto(`${base}/admin/categories`, { waitUntil: 'networkidle' });
  const add = page.locator('form', { has: page.getByRole('button', { name: 'Add category' }) });
  await add.getByLabel('Name').fill('Payroll & HR');
  await expect(add.getByLabel('Web address')).toHaveValue('payroll-and-hr');
  await add.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText('Saved. The store is updated.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.locator('form', { has: page.getByRole('button', { name: 'Add category' }) }).getByLabel('Name').fill('Payroll & HR');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText(/already exists/)).toBeVisible();

  assert.deepEqual(errors, []);
} finally { await browser.close(); }
console.log('Admin browser check passed: sign-in, every section, draft product, details reflected in store, save errors shown, visibility and bulk actions reflected in store, banner table with edit and delete, banner and section pages, size presets and fit, new and deleted sections, image required, ended band hidden, banner schedule kept, category address made from the name.');
