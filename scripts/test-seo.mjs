import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { load } from './test-commerce.mjs';

const seo = load('src/lib/seo.ts');
const store = { name: 'Shop', tagline: 'The shop tagline.', url: 'https://shop.test' };
const bad = (fn, pattern) => assert.throws(fn, (e) => e instanceof seo.SeoError && pattern.test(e.message));

// Validation: whitelist, lengths, https addresses, robots tokens, enums, JSON-LD.
{
  const ok = seo.parsePageSeo({ title: '  A   title ', description: 'd', canonical: 'https://shop.test/x', robots: 'NOINDEX,  follow', ogImage: '/api/media/123e4567-e89b-12d3-a456-426614174000',
    twitterImage: 'https://cdn.test/a.png', sitemapPriority: '0.7', sitemapChangefreq: 'weekly', sitemapExclude: 'yes', ogType: 'product', jsonLd: '{"@type":"Thing"}', evil: 'x', path: '/x' });
  assert.deepEqual(ok, { title: 'A title', description: 'd', canonical: 'https://shop.test/x', robots: 'noindex, follow', ogType: 'product', ogImage: '/api/media/123e4567-e89b-12d3-a456-426614174000',
    twitterImage: 'https://cdn.test/a.png', sitemapExclude: 'yes', sitemapPriority: '0.7', sitemapChangefreq: 'weekly', jsonLd: '{"@type":"Thing"}' });
  assert.deepEqual(seo.parsePageSeo({ title: '', description: '  ' }), {});
  bad(() => seo.parsePageSeo({ title: 'x'.repeat(121) }), /at most 120/);
  bad(() => seo.parsePageSeo({ canonical: 'http://shop.test/x' }), /https/);
  bad(() => seo.parsePageSeo({ canonical: 'javascript:alert(1)' }), /https/);
  bad(() => seo.parsePageSeo({ ogImage: 'http://x.test/a.png' }), /https/);
  bad(() => seo.parsePageSeo({ ogImage: '/uploads/a.png' }), /https/);
  bad(() => seo.parsePageSeo({ robots: 'index, bogus' }), /not an allowed/);
  bad(() => seo.parsePageSeo({ robots: 'index, noindex' }), /both/);
  bad(() => seo.parsePageSeo({ sitemapPriority: '2.0' }), /allowed/);
  bad(() => seo.parsePageSeo({ sitemapChangefreq: 'hourly' }), /allowed/);
  bad(() => seo.parsePageSeo({ ogType: 'video' }), /allowed/);
  bad(() => seo.parsePageSeo({ jsonLd: '{nope' }), /not valid JSON/);
  bad(() => seo.parsePageSeo({ jsonLd: '"text"' }), /object or array/);
  bad(() => seo.parsePageSeo({ jsonLd: JSON.stringify({ a: 'x'.repeat(21000) }) }), /20 KB/);
  assert.equal(seo.parsePageSeo({ jsonLd: '[{"a":1}]' }).jsonLd, '[{"a":1}]');
  assert.deepEqual(seo.parseSiteSeo({ siteName: 'S', titleTemplate: '%s - S', robots: 'index, follow', zzz: 1 }), { siteName: 'S', titleTemplate: '%s - S', robots: 'index, follow' });
  bad(() => seo.parseSiteSeo({ titleTemplate: 'no placeholder' }), /%s/);
  assert.ok(seo.isSeoPath('*') && seo.isSeoPath('/') && seo.isSeoPath('/products/a-b') && !seo.isSeoPath('products') && !seo.isSeoPath('//x') && !seo.isSeoPath('/a b'));
}

// Merging: page defaults < site defaults < page override.
{
  const defaults = { title: 'Terms of Use' };
  const plain = seo.resolveSeo({ path: '/terms', defaults, store });
  assert.equal(plain.title, 'Terms of Use | Shop');
  assert.equal(plain.description, 'The shop tagline.');
  assert.equal(plain.canonical, 'https://shop.test/terms');
  assert.equal(plain.robots, 'index, follow');
  const site = { siteName: 'Acme', titleTemplate: '%s :: Acme', description: 'Site desc', ogImage: 'https://cdn.test/site.png', robots: 'index, follow, max-image-preview:large' };
  const withSite = seo.resolveSeo({ path: '/terms', defaults, site, store });
  assert.equal(withSite.title, 'Terms of Use :: Acme');
  assert.equal(withSite.description, 'Site desc');
  assert.equal(withSite.ogImage, 'https://cdn.test/site.png');
  assert.equal(withSite.siteName, 'Acme');
  const over = seo.resolveSeo({ path: '/terms', defaults, site, store, override: { title: 'Exact title', description: 'Mine', ogImage: 'https://cdn.test/mine.png', robots: 'noindex, follow', canonical: 'https://x.test/t' } });
  assert.equal(over.title, 'Exact title', 'a typed title is used exactly, without the template');
  assert.equal(over.description, 'Mine');
  assert.equal(over.ogTitle, 'Exact title');
  assert.equal(over.ogImage, 'https://cdn.test/mine.png');
  assert.equal(over.canonical, 'https://x.test/t');
  assert.equal(over.noindex, true);
  // A noindex page stays noindex despite site defaults; a product cover beats the site image; the home title skips the template.
  assert.equal(seo.resolveSeo({ path: '/cart', defaults: { title: 'Cart', robots: 'noindex, nofollow' }, site, store }).robots, 'noindex, nofollow');
  assert.equal(seo.resolveSeo({ path: '/products/a', defaults: { title: 'A', ogImage: 'https://cdn.test/cover.png' }, site, store }).ogImage, 'https://cdn.test/cover.png');
  assert.equal(seo.resolveSeo({ path: '/', defaults: { title: 'Shop', fullTitle: true }, store }).title, 'Shop');
  assert.equal(seo.applyTemplate('%s | $&', 'a$&b'), 'a$&b | $&', 'titles are not treated as replacement patterns');
}

// Metadata output.
{
  const r = seo.resolveSeo({ path: '/p', defaults: { title: 'P', ogType: 'product', ogImage: '/api/media/x' }, store,
    override: { keywords: 'a, b ,', twitterCard: 'summary', robots: 'noindex, nofollow' } });
  const m = seo.toMetadata(r, store);
  assert.deepEqual(m.title, { absolute: 'P | Shop' });
  assert.deepEqual(m.keywords, ['a', 'b']);
  assert.equal(m.alternates.canonical, 'https://shop.test/p');
  assert.equal(m.robots, 'noindex, nofollow');
  assert.equal(m.openGraph.type, undefined, 'product is not a type Next prints; <SeoHead> prints it');
  assert.deepEqual(m.openGraph.images, ['https://shop.test/api/media/x']);
  assert.equal(m.openGraph.siteName, 'Shop');
  assert.equal(m.twitter.card, 'summary');
  assert.deepEqual(m.twitter.images, ['https://shop.test/api/media/x']);
  assert.equal(seo.toMetadata(seo.resolveSeo({ path: '/a', defaults: { title: 'A' }, store, override: { ogType: 'article' } }), store).openGraph.type, 'article');
}

// Structured data is escaped for a script tag; bad JSON is skipped.
{
  const html = seo.jsonLdHtml('{"name":"</script><script>alert(1)</script> & x"}');
  assert.ok(!html.includes('<') && !html.includes('>') && html.includes('\\u003c/script'));
  assert.deepEqual(JSON.parse(html), { name: '</script><script>alert(1)</script> & x' });
  assert.equal(seo.jsonLdHtml('{broken'), null);
  assert.equal(seo.jsonLdHtml('3'), null);
}

// The checklist and the starter templates.
{
  const r = seo.resolveSeo({ path: '/x', defaults: { title: 'X' }, store, override: { title: 'A title that is long enough to pass the check', focusKeyword: 'title',
    description: 'A description that mentions the title and is long enough to sit inside the recommended range of one hundred and twenty to one hundred and sixty.', canonical: 'https://shop.test/x', ogImage: 'https://cdn.test/a.png' } });
  const checks = seo.seoChecks(r, { jsonLd: '{"a":1}' }, {});
  assert.equal(checks.length, 9);
  assert.deepEqual(checks.filter((c) => !c.ok), []);
  assert.equal(seo.seoChecks(r, { jsonLd: '{bad' }, {}).at(-1).label, 'JSON-LD is not valid JSON');
  assert.equal(seo.seoChecks(r, {}, { hasJsonLd: true }).at(-1).ok, true);
  const ctx = { store, path: '/x', label: 'X', title: 'X', description: 'D', canonical: 'https://shop.test/x', image: '/api/media/i' };
  for (const type of seo.TEMPLATE_TYPES) {
    const parsed = JSON.parse(seo.jsonLdTemplate(type, ctx));
    assert.equal(parsed['@context'], 'https://schema.org');
    assert.equal(parsed['@type'], type);
  }
}

// Sitemap rows honour include, priority, change frequency and noindex.
{
  const row = (override, defaults = { title: 'X' }) => seo.sitemapRow('/x', seo.resolveSeo({ path: '/x', defaults, store, override }), store, 0.4);
  assert.deepEqual({ ...row({}), lastModified: 0 }, { url: 'https://shop.test/x', lastModified: 0, priority: 0.4 });
  assert.equal(row({ sitemapExclude: 'yes' }), null);
  assert.equal(row({ robots: 'noindex, follow' }), null);
  assert.equal(row({}, { title: 'X', robots: 'noindex, nofollow' }), null);
  const custom = row({ sitemapPriority: '0.9', sitemapChangefreq: 'daily' });
  assert.equal(custom.priority, 0.9);
  assert.equal(custom.changeFrequency, 'daily');
  assert.equal(seo.sitemapRow('/', seo.resolveSeo({ path: '/', defaults: { title: 'S' }, store }), store, 1).url, 'https://shop.test');
}

// Database: the migration, save, replace, reset, tolerant reads, and the real sitemap.
const migrationDb = async (withSeo) => {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  for (const n of readdirSync(new URL('../migrations/', import.meta.url)).filter((n) => n.endsWith('.sql') && (withSeo || !n.includes('seo'))).sort())
    await db.exec(readFileSync(new URL(`../migrations/${n}`, import.meta.url), 'utf8'));
  const sql = async (parts, ...v) => (await db.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), v)).rows;
  return { db, sql };
};
const modules = (sql, extra = {}) => {
  const db = { sql, getBooks: async () => [] };
  return { './db': db, '@/lib/db': db, ...extra };
};
{
  const { db, sql } = await migrationDb(true);
  const seoStore = load('src/lib/seo-store.ts', modules(sql));
  assert.deepEqual(await seoStore.getSeoRows(), []);
  await seoStore.saveSeo('/terms', { title: 'Legal terms' });
  await seoStore.saveSeo('*', { siteName: 'Acme', titleTemplate: '%s :: Acme' });
  assert.deepEqual(await seoStore.getPageSeo('/terms'), { site: { siteName: 'Acme', titleTemplate: '%s :: Acme' }, override: { title: 'Legal terms' } });
  assert.deepEqual(await seoStore.getPageSeo('/privacy'), { site: { siteName: 'Acme', titleTemplate: '%s :: Acme' }, override: {} });
  await seoStore.saveSeo('/terms', { description: 'Only this now' });
  assert.deepEqual((await seoStore.getPageSeo('/terms')).override, { description: 'Only this now' }, 'save replaces the stored override');
  // A damaged row can never inject unknown keys or non-string values.
  await db.query(`insert into seo_pages(path,data) values('/odd', '{"title":"ok","evil":"x","robots":5,"jsonLd":["a"]}')`);
  assert.deepEqual((await seoStore.getPageSeo('/odd')).override, { title: 'ok' });
  const { site, overrides } = seoStore.indexRows(await seoStore.getSeoRows());
  assert.equal(site.siteName, 'Acme');
  assert.equal(overrides.get('/terms').description, 'Only this now');
  assert.deepEqual((await sql`select payload->>'path' as path from events where type = 'admin.seo.saved' order by id`).map((r) => r.path), ['/terms', '*', '/terms']);
  await seoStore.resetSeo('/terms');
  assert.deepEqual((await seoStore.getPageSeo('/terms')).override, {});
  assert.equal((await sql`select count(*)::int n from events where type = 'admin.seo.reset'`)[0].n, 1);

  // The real sitemap honours the overrides.
  await db.query(`insert into seo_pages(path,data) values('/privacy','{"sitemapExclude":"yes"}'),('/search','{"sitemapPriority":"0.9","sitemapChangefreq":"daily"}'),
    ('/products/hidden','{"robots":"noindex, follow"}'),('/category/gst','{"sitemapExclude":"yes"}')`);
  const books = [{ slug: 'shown', active: true, title: 'Shown', description: 'd', cover: null }, { slug: 'hidden', active: true, title: 'Hidden', description: null, cover: null }];
  const mocks = modules(sql, {
    '@/lib/store': { siteUrl: () => 'https://shop.test', STORE: { name: 'Shop', tagline: 'T' } }, './store': { siteUrl: () => 'https://shop.test', STORE: { name: 'Shop', tagline: 'T' } },
    '@/components/book-data': { visibleBook: (b) => b.active }, '@/lib/store-data': { getCategories: async () => [{ slug: 'gst', name: 'GST' }, { slug: 'tds', name: 'TDS' }] },
    '@/lib/seo-meta': { storeInfo: () => ({ name: 'Shop', tagline: 'T', url: 'https://shop.test' }) },
  });
  mocks['./db'] = mocks['@/lib/db'] = { sql, getBooks: async () => books };
  const sitemap = load('src/app/sitemap.ts', mocks).default;
  const rows = await sitemap();
  const byUrl = Object.fromEntries(rows.map((r) => [r.url, r]));
  assert.ok(byUrl['https://shop.test'], 'home is listed');
  assert.ok(!byUrl['https://shop.test/privacy'], 'excluded page is left out');
  assert.ok(!byUrl['https://shop.test/products/hidden'], 'noindex product is left out');
  assert.ok(!byUrl['https://shop.test/category/gst'], 'excluded category is left out');
  assert.ok(byUrl['https://shop.test/products/shown'] && byUrl['https://shop.test/category/tds'] && byUrl['https://shop.test/terms']);
  assert.equal(byUrl['https://shop.test/search'].priority, 0.9);
  assert.equal(byUrl['https://shop.test/search'].changeFrequency, 'daily');
  assert.equal(byUrl['https://shop.test'].priority, 1);
  assert.equal(byUrl['https://shop.test/terms'].priority, 0.4);
  await db.close();
}

// Missing table (migration not applied yet): reads fall back to defaults and the sitemap still works.
{
  const { db, sql } = await migrationDb(false);
  const seoStore = load('src/lib/seo-store.ts', modules(sql));
  const logged = []; const original = console.error; console.error = (...a) => logged.push(a);
  try {
    assert.deepEqual(await seoStore.getSeoRows(), []);
    assert.deepEqual(await seoStore.getPageSeo('/terms'), { site: {}, override: {} });
  } finally { console.error = original; }
  assert.deepEqual(logged, [], 'a missing table is expected and not logged as an error');
  assert.equal(seoStore.isMissingTable({ code: '42P01' }), true);
  assert.equal(seoStore.isMissingTable(new Error('relation "seo_pages" does not exist')), true);
  assert.equal(seoStore.isMissingTable(new Error('boom')), false);
  await assert.rejects(() => seoStore.saveSeo('/x', { title: 'x' }), (e) => seoStore.isMissingTable(e), 'writes report the missing table');
  await db.close();
}
console.log('SEO checks passed: validation, merging, metadata, sitemap overrides, JSON-LD escaping, database round trip and missing-table fallback.');
