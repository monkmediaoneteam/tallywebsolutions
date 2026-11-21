import assert from 'node:assert/strict';
import { load } from './test-commerce.mjs';

// home.ts reaches content.ts (via content-data), which imports the database client; the pure helpers never call it.
const { buildHome, bannerSections, sectionsAt } = load('src/lib/home.ts', { './db': { sql() { throw new Error('No database in home tests'); } } });
const now = new Date('2026-10-15T00:00:00Z');
const book = (slug, extra = {}) => ({ slug, title: slug, cover: `/c/${slug}.png`, authorship: 'A', author_slug: null, category_slug: 'fiction', language: 'English',
  saleable: true, saveable: true, price: 100, regular: 100, onSale: false, saving: 0, comingSoon: false, release_date: '2026-01-01', year: 2026, ...extra });
const books = [book('a', { onSale: true, saving: 30, price: 70 }), book('b', { onSale: true, saving: 50, price: 50, language: 'Hindi' }),
  book('c', { comingSoon: true, release_date: '2026-11-01', saleable: false }), book('d', { category_slug: 'science', release_date: '2026-09-01', author_slug: 'au1' }),
  book('e', { category_slug: 'science', language: 'Hindi' })];
const categories = [{ slug: 'fiction', name: 'Fiction', colour: '#f00', image_url: null, parent_slug: null, sort: 0 },
  { slug: 'science', name: 'Science', colour: null, image_url: null, parent_slug: null, sort: 1 },
  { slug: 'empty', name: 'Empty', colour: null, image_url: null, parent_slug: null, sort: 2 }];
const mod = (id, type, extra = {}) => ({ id, type, title: id, body: null, image_url: null, mobile_image_url: null, link_url: null, link_label: null,
  payload: {}, sort: 0, status: 'published', publish_at: null, ends_at: null, ...extra });

const home = buildHome({ books, categories, now, bestsellers: ['ghost', 'd', 'a'],
  authors: [{ id: 'au1', name: 'Author One', photo_url: null }, { id: 'au2', name: 'No Books', photo_url: null }],
  modules: [mod('b1', 'banner', { sort: 2, image_url: '/api/media/b1' }), mod('b0', 'banner', { sort: 1, image_url: '/api/media/b0' }), mod('old', 'banner', { image_url: '/api/media/old', ends_at: '2026-10-01T00:00:00Z' }), mod('noimg', 'banner', { sort: 0 }),
    mod('s1', 'banner', { sort: 3, image_url: '/api/media/x', payload: { placement: 'side-1' } }), mod('s2', 'banner', { sort: 4, image_url: '/api/media/s2', payload: { placement: 'side-2' } }), mod('s1b', 'banner', { sort: 5, payload: { placement: 'side-1' } }),
    mod('p1', 'promo', { payload: { size: 'large', category_slug: 'fiction', theme: 'coral' } }), mod('g', 'genre-switcher', { payload: { category_slugs: ['science', 'empty', 'fiction'] } })] });

const at = (key) => home.sections.find((p) => p.section.key === key);
assert.deepEqual(at('hero').banners.map(b => b.id), ['b0', 'b1'], 'ordered, expired and imageless banners dropped, side banners not in the hero');
// Side cards are off by default: the homepage top is one full-width hero, and no side column is drawn.
assert.equal(at('side'), undefined, 'side cards are off by default');
assert.equal(sectionsAt(home.sections, 'home-top-side').length, 0, 'no side column by default');
assert.deepEqual(sectionsAt(home.sections, 'home-top-main').map(p => p.section.key), ['hero']);
// Product pages and search/category pages get the banners placed in their sections.
const pageMods = [mod('p0', 'banner', { sort: 1, payload: { placement: 'product' } }), mod('p1', 'banner', { sort: 2, image_url: '/api/media/p1', payload: { placement: 'product' } }),
  mod('l1', 'banner', { sort: 3, image_url: '/api/media/l1', payload: { placement: 'listing' } })];
const placed = bannerSections(pageMods, now);
assert.deepEqual(sectionsAt(placed, 'product-below-tabs')[0].banners.map(b => b.id), ['p1'], 'a banner without an image is skipped');
assert.deepEqual(sectionsAt(placed, 'listing-above-results')[0].banners.map(b => b.id), ['l1']);
// Admin settings: a section's maximum caps what shows, a switched-off section disappears, a custom section can be placed anywhere.
const many = Array.from({ length: 4 }, (_, i) => mod(`g${i}`, 'banner', { sort: i, image_url: `/api/media/g${i}`, payload: { placement: 'promo-row' } }));
const custom = bannerSections([...many, mod('row', 'banner-section', { title: 'Promo row', sort: 50, payload: { key: 'promo-row', position: 'home-after-products', layout: 'grid', max: 3, columns: 3, enabled: 'on' } }),
  mod('off', 'banner-section', { title: 'Hero', payload: { key: 'hero', enabled: 'off' } })], now);
const row = sectionsAt(custom, 'home-after-products')[0];
assert.equal(row.section.layout, 'grid'); assert.deepEqual(row.banners.map(b => b.id), ['g0', 'g1', 'g2'], 'only the section maximum shows');
assert.equal(sectionsAt(custom, 'home-top-main').length, 0, 'a switched-off section is left out');
assert.equal(home.promos[0].books.length, 2);
assert.ok(home.promos[0].books.every(b => b.category_slug === 'fiction' && b.saleable));
const rail = key => home.rails.find(r => r.key === key);
assert.deepEqual(rail('bestsellers').books.map(b => b.slug), ['d', 'a'], 'unknown slugs dropped, real order kept');
assert.deepEqual(rail('offers').books.map(b => b.slug), ['b', 'a']);
assert.deepEqual(rail('soon').books.map(b => b.slug), ['c']);
assert.ok(!rail('new').books.some(b => b.comingSoon));
assert.deepEqual(home.genres.map(g => g.slug), ['science', 'fiction'], 'empty genre dropped, admin order kept');
assert.deepEqual(home.languages.map(l => [l.name, l.count]), [['English', 3], ['Hindi', 2]]);
assert.ok(!('glyph' in home.languages[1]), 'languages carry names and counts only; script letterforms are retired');
assert.deepEqual(home.categoryTiles.map(t => t.slug), ['fiction', 'science']);
assert.deepEqual(home.authors.map(a => a.id), ['au1']);

const empty = buildHome({ books: [], categories: [], modules: [], bestsellers: [], authors: [], now });
assert.deepEqual([empty.sections.flatMap(p => p.banners), empty.promos, empty.rails, empty.genres, empty.languages, empty.categoryTiles, empty.authors].map(x => x.length), [0, 0, 0, 0, 0, 0, 0]);
console.log('Home assembly checks passed: banner order and expiry, promo books, honest bestsellers, rails, genres, languages, tiles, authors.');
