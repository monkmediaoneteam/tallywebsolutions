import assert from 'node:assert/strict';
import { bundlePrice, allocate, bundleSlugOf, isBundle, liveParts, overlayBundle } from '../src/lib/bundles.ts';

// Price: the products' total less the percent, in whole rupees.
assert.equal(bundlePrice(100000, 5), 95000, '₹1,000 less 5% is ₹950');
assert.equal(bundlePrice(24300, 5), 23100, 'rounded to a whole rupee (₹243 → ₹231)');
assert.equal(bundlePrice(50000, 0), 50000);
assert.equal(bundlePrice(0, 5), 0);
assert.equal(bundlePrice(100000, 99), 10000, 'a percent above 90 is held at 90');

// Splitting one amount across products: exact, in whole paise, leftover to the dearest.
assert.equal(allocate(1000, [1, 1, 1]).reduce((a, b) => a + b, 0), 1000, 'always adds up');
assert.deepEqual(allocate(95000, [25000, 25000, 50000]), [23750, 23750, 47500], 'in proportion to price');
assert.deepEqual(allocate(0, [5, 5]), [0, 0]);
assert.deepEqual(allocate(10, []), []);
assert.equal(allocate(2147483647, [99999999, 1]).reduce((a, b) => a + b, 0), 2147483647, 'big amounts stay exact');

// A book row is a bundle only if its facts say so.
assert.equal(bundleSlugOf({ facts: { _bundle_of: 'sec' } }), 'sec');
assert.equal(bundleSlugOf({ facts: { _pack_of: 'old' } }), 'old', 'a pack built by the earlier version is a bundle too');
assert.equal(isBundle({ facts: {} }), false);
assert.equal(isBundle({ facts: null }), false);

// The bundle, as the store sees it.
const book = (slug, price, extra = {}) => ({ slug, title: slug.toUpperCase(), price_inr: price, active: true, file_url: `private:${slug}.tdl`, release_approved: true, scan_status: 'clean',
  facts: {}, highlights: [], sale_price_inr: null, sale_starts_at: null, sale_ends_at: null, ...extra });
const now = new Date('2026-06-01T00:00:00Z');
const anchor = book('sec', 100, { title: 'old', file_url: null, release_approved: false, scan_status: 'pending', facts: { _bundle_of: 'sec' } });
const pool = [book('a', 10000), book('b', 20000), book('c', 30000, { active: false }), book('d', 40000, { file_url: null }), book('e', 50000, { facts: { _demo: 'true' } }), anchor];
const coll = { slug: 'sec', title: 'Security Pack', description: 'Lock every door.', image_url: '/api/media/x', book_slugs: ['a', 'b', 'c', 'd', 'e', 'sec', 'ghost'], status: 'published', publish_at: null };
assert.deepEqual(liveParts(coll, pool).map((b) => b.slug), ['a', 'b'], 'only products that can be bought today; never itself, demos or missing ones');
const live = overlayBundle(anchor, coll, pool, now, 5);
assert.deepEqual([live.title, live.description, live.cover, live.active], ['Security Pack', 'Lock every door.', '/api/media/x', true], 'title, words and image come from the collection');
assert.deepEqual([live.price_inr, live.sale_price_inr], [30000, 28500], 'the items add up to ₹300; the bundle is 5% less');
assert.deepEqual(live.highlights, ['A', 'B'], 'what is inside');
assert.ok(live.file_url.startsWith('bundle:') && live.release_approved && live.scan_status === 'clean', 'it can be bought; the file is a marker only');
// Editing the collection changes the bundle at once.
const grown = overlayBundle(anchor, { ...coll, book_slugs: ['a', 'b', 'e', 'x'] }, [...pool, book('x', 10000)], now, 5);
assert.deepEqual([grown.price_inr, grown.sale_price_inr, grown.highlights], [40000, 38000, ['A', 'B', 'X']], 'add a product and the price follows');
// A product on sale counts at its sale price.
const onSale = overlayBundle(anchor, { ...coll, book_slugs: ['a', 'f'] }, [book('a', 10000), book('f', 20000, { sale_price_inr: 10000 }), anchor], now, 5);
assert.deepEqual([onSale.price_inr, onSale.sale_price_inr], [30000, 19000], 'regular total struck through, bundle priced from current prices');
// Hidden when it should not sell.
assert.equal(overlayBundle(anchor, { ...coll, status: 'draft' }, pool, now).active, false, 'a draft collection is not for sale');
assert.equal(overlayBundle(anchor, { ...coll, publish_at: '2027-01-01T00:00:00Z' }, pool, now).active, false, 'not before its publish time');
assert.equal(overlayBundle(anchor, { ...coll, book_slugs: ['a'] }, pool, now).active, false, 'fewer than two products on sale');
assert.equal(overlayBundle(anchor, undefined, pool, now).active, false, 'collection deleted');
assert.equal(overlayBundle(anchor, coll, pool, now, 0).sale_price_inr, null, 'no percent, no strike-through');

console.log('Bundle checks passed: price, splitting, live collection, hidden states.');
