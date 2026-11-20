import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 }); // a cold dev server compiles each page on first visit

const base = process.env.PREVIEW_URL || 'http://localhost:3100';
const token = process.env.ADMIN_TOKEN;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Admin checks must target the isolated preview.');
assert.match(token || '', /^[a-f0-9]{64}$/, 'Start the preview with ADMIN_TOKEN=<64 hex> and pass the same value here.');
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on('dialog', (d) => d.accept().catch(() => {})); // every confirm in these checks is an accept
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto(`${base}/admin/login`);
  await page.getByLabel('Admin email').fill(process.env.ADMIN_EMAIL || 'admin@preview.test');
  await page.getByLabel('Admin password').fill(token);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${base}/admin`);
  for (const [link, heading] of [['Orders', 'Orders'], ['Products', 'Products'], ['Categories', 'Categories'], ['Developers', 'Developers'],
    ['Collections', 'Collections'], ['Banners', 'Banners'], ['Homepage sections', 'Homepage sections'], ['Theme', 'Theme'], ['Advanced content', 'Advanced content'], ['Submissions', 'Submissions'], ['Delivery recovery', 'Delivery recovery']]) {
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
  await page.waitForLoadState('networkidle');
  await expect(async () => { await page.getByLabel('Select all products on this page').click(); await expect(page.getByText(/\d+ selected/)).toBeVisible({ timeout: 3000 }); }).toPass({ timeout: 40000 });
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
  await page.getByRole('button', { name: 'Delete Hero renamed' }).click();
  await saved();
  await expect(bannerRow('Hero renamed')).toHaveCount(0);
  await page.getByRole('link', { name: 'Edit Side check' }).last().click();
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
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(page).toHaveURL(/\/admin\/banners\/sections\?saved=1/);
  await expect(page.locator('tr', { hasText: 'Hero' }).first().getByText('1920 × 600 px')).toBeVisible();
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

  // ---- Homepage sections: add, edit, reorder, hide, duplicate, delete, each reflected on the storefront.
  page.setDefaultTimeout(60000);
  const slow = (target) => expect(target, { timeout: 45000 });
  const order = async () => { await page.goto(base, { waitUntil: 'networkidle' }); return page.locator('main > [data-section]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-section')}|${(e.textContent || '').includes('Check heading') ? 'mine' : ''}`)); };
  const addSection = async (name) => {
    await page.goto(`${base}/admin/homepage`, { waitUntil: 'networkidle' });
    await page.locator('summary', { hasText: 'Add section' }).click();
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await expect(page).toHaveURL(/\/admin\/homepage\/[a-z0-9-]+$/);
    await page.waitForLoadState('networkidle');
  };
  const saveSection = async () => { await page.getByRole('button', { name: 'Save', exact: true }).click(); await slow(page).toHaveURL(/\?saved=1/); await slow(page.getByText('Saved. The storefront is updated.')).toBeVisible(); };
  const defaultOrder = (await order()).map((s) => s.split('|')[0]);
  assert.deepEqual(defaultOrder.filter((t) => t !== 'banner-slot' && t !== 'top'), ['quick-links', 'categories', 'rails', 'look-inside', 'languages', 'developers', 'publish', 'faq'].filter((t) => defaultOrder.includes(t)), 'default order is the storefront as it was');
  await addSection('Rich text');
  await page.locator('input[name="s.heading"]').fill('Check heading');
  await page.locator('input[name="s.text_color"]').fill('#aa0000');
  await page.locator('input[name="s.background"]').fill('#eeeeee');
  await page.getByLabel('Custom spacing').check();
  await page.locator('input[name="s.pad_top"]').fill('80');
  await page.locator('input[name="s.pad_bottom"]').fill('24');
  await page.getByLabel('Show divider').check();
  await saveSection();
  const mine = page.locator('[data-section="rich-text"]', { hasText: 'Check heading' });
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(mine).toHaveCount(1);
  const css = await mine.evaluate((e) => { const s = getComputedStyle(e); return { pt: s.paddingTop, pb: s.paddingBottom, bg: s.backgroundColor, color: s.color, border: s.borderBottomWidth, style: e.getAttribute('style') }; });
  assert.equal(css.pt, '80px'); assert.equal(css.pb, '24px'); assert.equal(css.bg, 'rgb(238, 238, 238)'); assert.equal(css.color, 'rgb(170, 0, 0)'); assert.equal(css.border, '1px');
  assert.match(css.style, /--hs-pt:\s*80px/);

  // Image with text overlay: height, overlay, position and padding settings reach the page.
  await addSection('Image with text overlay');
  await page.locator('input[name="s.heading"]').fill('Overlay check');
  await page.locator('select[name="s.height_desktop"]').selectOption('700px');
  await page.locator('input[name="s.overlay_opacity"]').fill('60');
  await page.locator('input[name="s.overlay_color"]').fill('#112233');
  await page.getByRole('radio', { name: 'Bottom right' }).last().click();
  await page.getByLabel('Custom spacing').check();
  await page.locator('input[name="s.pad_top"]').fill('0');
  await saveSection();
  await page.goto(base, { waitUntil: 'networkidle' });
  const io = page.locator('.io', { hasText: 'Overlay check' });
  await expect(io).toHaveCount(1);
  const ioStyle = await io.getAttribute('style');
  assert.match(ioStyle, /--io-h:\s*700px/); assert.match(ioStyle, /--io-opacity:\s*0\.6/); assert.match(ioStyle, /--io-overlay:\s*#112233/);
  assert.match(ioStyle, /--io-ai:\s*flex-end/); assert.match(ioStyle, /--io-jc:\s*flex-end/);
  assert.equal(await io.locator('.io-media').evaluate((e) => getComputedStyle(e).height), '700px');
  assert.equal(await page.locator('[data-section="image-overlay"]').evaluate((e) => getComputedStyle(e).paddingTop), '0px');

  // Reorder: moving up twice puts it two places earlier.
  const before = await order();
  const at = (list) => list.findIndex((s) => s.endsWith('|mine'));
  await page.goto(`${base}/admin/homepage`, { waitUntil: 'networkidle' });
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: 'Move Check heading up' }).click(); await slow(page).toHaveURL(/saved=1/); await page.waitForLoadState('networkidle'); }
  const after = await order();
  assert.equal(at(after), at(before) - 2, 'moved two places up on the storefront');
  // Hide: gone from the storefront, still in the list; show again.
  await page.goto(`${base}/admin/homepage`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Hide Check heading' }).click();
  await slow(page.getByRole('button', { name: 'Show Check heading' })).toBeVisible();
  assert.equal(at(await order()), -1, 'a hidden section is absent from the storefront');
  await page.goto(`${base}/admin/homepage`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Show Check heading' }).click();
  await slow(page.getByRole('button', { name: 'Hide Check heading' })).toBeVisible();
  assert.equal(at(await order()), at(after));
  // Duplicate: two on the page.
  await page.goto(`${base}/admin/homepage`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Duplicate Check heading' }).click();
  await expect(page).toHaveURL(/\/admin\/homepage\/rich-text-/);
  assert.equal((await order()).filter((s) => s.endsWith('|mine')).length, 2);
  // Hiding a built-in section hides it on the storefront.
  await page.goto(`${base}/admin/homepage`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Hide Good to know' }).click();
  await slow(page.getByRole('button', { name: 'Show Good to know' })).toBeVisible();
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.locator('#faq')).toHaveCount(0);
  await page.goto(`${base}/admin/homepage`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Show Good to know' }).click();
  await slow(page.getByRole('button', { name: 'Hide Good to know' })).toBeVisible();
  // A rejected save keeps what was typed and says why.
  await page.goto(`${base}/admin/homepage`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Edit Check heading' }).first().click();
  await page.waitForLoadState('networkidle');
  await page.locator('input[name="s.heading"]').fill('Kept on error');
  await page.locator('input[name="s.text_color"]').fill('red');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await slow(page.locator('p[role="alert"]')).toContainText(/must be a colour/);
  await expect(page.locator('input[name="s.heading"]')).toHaveValue('Kept on error');
  // The FAQ questions are editable blocks.
  await page.goto(`${base}/admin/homepage/faq`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Remove question 1' }).click();
  await page.getByRole('button', { name: /^Add question/ }).click();
  await page.locator('[data-block]').last().locator('input').first().fill('Block question?');
  await saveSection();
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.locator('#faq summary')).toHaveCount(6);
  await expect(page.locator('#faq summary', { hasText: 'Block question?' })).toHaveCount(1);
  await expect(page.locator('#faq summary', { hasText: 'How do I get my add-on?' })).toHaveCount(0);
  // Delete the test sections.
  await page.goto(`${base}/admin/homepage`, { waitUntil: 'networkidle' });
  for (const name of ['Check heading', 'Check heading', 'Overlay check']) {
    await page.getByRole('button', { name: `Delete ${name}` }).first().click();
    await slow(page.getByText('Saved. The storefront is updated.')).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
  await expect(page.locator('tr', { hasText: 'Check heading' })).toHaveCount(0);
  // Reset the layout.
  await page.getByRole('button', { name: /Reset to default layout/ }).click();
  await slow(page.getByText('Saved. The storefront is updated.')).toBeVisible();
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.locator('#faq summary', { hasText: 'How do I get my add-on?' })).toHaveCount(1);

  // ---- Theme: colours reach the storefront; low contrast warns; reset restores.
  await page.goto(`${base}/admin/theme`, { waitUntil: 'networkidle' });
  await page.locator('#t-brand').fill('#aa0000');
  await page.locator('#t-link').fill('#0000cc');
  await page.getByLabel('Page width').selectOption('1280');
  await page.getByLabel('Button style').selectOption('square');
  await page.getByRole('button', { name: 'Save theme' }).click();
  await slow(page.getByText('Saved. The storefront is updated.')).toBeVisible();
  await page.goto(base, { waitUntil: 'networkidle' });
  const themed = await page.evaluate(() => ({ brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(), link: getComputedStyle(document.querySelector('.section-head .link-line')).color,
    wrap: Math.round(document.querySelector('.carousel').closest('.wrap').getBoundingClientRect().width), btn: getComputedStyle(document.querySelector('.btn')).borderTopLeftRadius }));
  assert.equal(themed.brand, '#aa0000'); assert.equal(themed.link, 'rgb(0, 0, 204)'); assert.ok(themed.wrap <= 1280); assert.equal(themed.btn, '2px');
  await page.goto(`${base}/admin/theme`, { waitUntil: 'networkidle' });
  await page.locator('#t-ink').fill('#dddddd');
  await expect(page.getByText('Low contrast.')).toBeVisible();
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await slow(page.getByText('Saved. The storefront is updated.')).toBeVisible();
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()), '#2e2e7e');

  assert.deepEqual(errors, []);
} finally { await browser.close(); }
console.log('Admin browser check passed: sign-in, every section, draft product, details reflected in store, save errors shown, visibility and bulk actions reflected in store, banner table with edit and delete, banner and section pages, size presets and fit, new and deleted sections, image required, ended band hidden, banner schedule kept, category address made from the name, homepage sections (add, edit, reorder, hide, duplicate, blocks, delete, reset) and theme reflected on the storefront.');
