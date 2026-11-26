// The bundle's database side, on a real in-memory Postgres with every migration: reading a bundle from its collection,
// the "Sell as one bundle" switch, and the products a checkout would deliver. Never connects to production.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createIsolatedDatabase } from './isolated-db.mjs';
import * as bundles from '../src/lib/bundles.ts';

const require = createRequire(import.meta.url);
const { db } = await createIsolatedDatabase();
const rows = async (text, params = []) => (await db.query(text, params)).rows;
// db.ts and bundle-data.ts read through this tagged template, exactly as the app does.
const sql = async (parts, ...values) => rows(parts.reduce((t, p, i) => t + (i ? `$${i}` : '') + p, ''), values);
function load(path, dependencies) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)((id) => dependencies[id] ?? require(id), module, module.exports);
  return module.exports;
}
process.env.PGLITE_DATABASE_DIR = 'test-only';
const dbModule = load('../src/lib/db.ts', {
  '@neondatabase/serverless': { neon: () => () => { throw new Error('no network'); } }, './env': { requireEnv: () => 'x' },
  './local-db': { localDatabase: () => ({ query: async (text, params) => ({ rows: await rows(text, params) }) }) }, './bundles': bundles,
});
const data = load('../src/lib/bundle-data.ts', { './db': dbModule, './bundles': bundles });

try {
  const book = (slug, price, extra = '') => rows(`insert into books(slug,title,price_inr,active,file_url,release_approved,scan_status${extra ? ',' + extra.split('=')[0] : ''})
    values($1,$2,$3,true,'private:x.tdl',true,'clean'${extra ? ',' + extra.split('=')[1] : ''})`, [slug, slug.toUpperCase(), price]);
  await book('a', 10000); await book('b', 20000); await book('c', 30000);
  await rows(`insert into books(slug,title,price_inr,active,file_url,release_approved,scan_status) values('off','OFF',5000,false,'private:x.tdl',true,'clean')`);
  await rows(`insert into content_collections(slug,title,description,image_url,book_slugs,status) values('sec','Security Pack','Lock every door.','/api/media/x','["a","b","c","off","nope"]','published')`);
  // The anchor row, as "Sell as one bundle" makes it.
  await rows(`insert into books(slug,title,price_inr,active,release_approved,scan_status,facts) values('sec','old',100,true,true,'clean','{"_bundle_of":"sec"}')`);

  const b = await dbModule.getBook('sec');
  assert.deepEqual([b.title, b.description, b.cover, b.active], ['Security Pack', 'Lock every door.', '/api/media/x', true], 'the bundle is read from its collection');
  assert.deepEqual([b.price_inr, b.sale_price_inr, b.highlights], [60000, 57000, ['A', 'B', 'C']], 'total of the products on sale, less 5%; the off-sale and missing ones are left out');
  const listed = (await dbModule.getBooks()).find((x) => x.slug === 'sec');
  assert.equal(listed.title, 'Security Pack', 'it is in the catalogue too');
  assert.equal((await dbModule.getBook('a')).title, 'A', 'ordinary products are untouched');

  const parts = await data.bundleParts([b]);
  assert.deepEqual(parts.get('sec').map((x) => x.slug), ['a', 'b', 'c'], 'checkout delivers the products inside, in order');

  // Changing the collection changes the bundle at once.
  await rows(`update content_collections set book_slugs='["a","b"]' where slug='sec'`);
  assert.deepEqual([(await dbModule.getBook('sec')).price_inr, (await dbModule.getBook('sec')).sale_price_inr], [30000, 28500], 'take a product out and the price follows');
  await rows(`update books set price_inr=40000 where slug='a'`);
  assert.equal((await dbModule.getBook('sec')).price_inr, 60000, 'a product price change flows through');

  // Hidden whenever it should not sell.
  await rows(`update content_collections set status='draft' where slug='sec'`);
  assert.equal((await dbModule.getBook('sec')).active, false, 'a draft collection does not sell');
  await rows(`update content_collections set status='published', book_slugs='["a"]' where slug='sec'`);
  assert.equal((await dbModule.getBook('sec')).active, false, 'one product is not a bundle');
  await rows(`update content_collections set book_slugs='["a","b"]' where slug='sec'`);
  await rows(`update books set active=false where slug='sec'`);
  assert.equal((await dbModule.getBook('sec')).active, false, 'switched off in admin');
  assert.equal((await dbModule.getBooks()).some((x) => x.slug === 'sec'), false, 'and out of the catalogue');

  // A store before the collections table exists reads bundles as hidden rather than failing.
  await rows(`update books set active=true where slug='sec'`);
  await rows('drop table content_collections');
  assert.equal((await dbModule.getBook('sec')).active, false, 'no collections table: hidden, no error');
  console.log('Bundle database checks passed: read from the collection, follows edits, delivers the products inside, hidden when it should not sell.');
} finally { await db.close(); }
