// Offline: which uploads count as used, what the Storage screen would clean up, and that replaced files are removed
// without ever deleting something a record or a customer's order still needs. Real migrations in PGlite, fake Blob store.
import assert from 'node:assert/strict';
import { createIsolatedDatabase } from './isolated-db.mjs';

const { pathsIn, usedPaths, storageReport, deleteUnused, releasePaths, kindOf, formatBytes, GRACE_MS } = await import('../src/lib/storage.ts');

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const media = (n) => `admin/media/${U(n)}`;
const product = (slug, n, kind = 'pdf') => `admin/books/${slug}/${U(n)}-${kind}`;
const blobUrl = (p) => `https://store.private.blob.vercel-storage.com/${p}`;

// Reading paths out of text
assert.deepEqual(pathsIn(`/api/media/${U(1)}`), [media(1)]);
assert.deepEqual(pathsIn(`{"image_url":"/api/media/${U(1)}","mobile":"/api/media/${U(2)}"}`).sort(), [media(1), media(2)]);
assert.deepEqual(pathsIn(blobUrl(product('my-addon', 3))), [product('my-addon', 3)]);
assert.deepEqual(pathsIn('https://example.com/a.png'), []);
assert.deepEqual(pathsIn(null), []);
assert.equal(kindOf(media(1)), 'image'); assert.equal(kindOf(product('a', 1)), 'product'); assert.equal(kindOf(product('a', 1, 'cover')), 'cover');
assert.equal(formatBytes(512), '512 B'); assert.equal(formatBytes(2048), '2.0 KB'); assert.equal(formatBytes(5 * 1048576), '5.0 MB');

const { db } = await createIsolatedDatabase();
const sql = async (parts, ...values) => (await db.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), values)).rows;
const now = Date.now();
const old = new Date(now - 3 * GRACE_MS), fresh = new Date(now - 60_000);

// A fake Blob store holding these files
const files = [
  { pathname: product('current-addon', 1), size: 1000, uploadedAt: old },        // the product's current file: used
  { pathname: product('current-addon', 2), size: 2000, uploadedAt: old },        // an older version a customer bought: used by an order
  { pathname: product('current-addon', 3), size: 4000, uploadedAt: old },        // an old replaced version nobody has: unused
  { pathname: product('current-addon', 4, 'cover'), size: 300, uploadedAt: old }, // current cover: used
  { pathname: product('gone-addon', 5), size: 8000, uploadedAt: old },           // belonged to a deleted product: unused
  { pathname: product('current-addon', 6), size: 500, uploadedAt: fresh },       // uploaded a minute ago, not saved yet: skipped
  { pathname: media(10), size: 100, uploadedAt: old },                           // banner image: used
  { pathname: media(11), size: 200, uploadedAt: old },                           // category image: used
  { pathname: media(12), size: 900, uploadedAt: old },                           // mobile banner image inside a payload: used
  { pathname: media(13), size: 700, uploadedAt: old },                           // abandoned upload: unused
].map((f) => ({ ...f, url: blobUrl(f.pathname) }));
const deleted = [];
const api = {
  async list({ prefix }) { return { blobs: files.filter((f) => f.pathname.startsWith(prefix) && !deleted.includes(f.url) && !deleted.includes(f.pathname)), hasMore: false }; },
  async del(urls) { deleted.push(...urls); },
};

try {
  await db.query(`insert into books(slug,title,price_inr,file_url,cover,facts,file_format) values
    ('current-addon','Current',100,$1,'/api/product-cover/current-addon/abc',$2::jsonb,'TDL')`,
    [blobUrl(product('current-addon', 1)), JSON.stringify({ _cover_blob: product('current-addon', 4, 'cover') })]);
  await db.query(`insert into orders(id,email,items,subtotal,total,status) values('o1','a@example.com',$1::jsonb,100,100,'paid')`,
    [JSON.stringify([{ slug: 'current-addon', title: 'Current', price: 100, file_url: blobUrl(product('current-addon', 2)) }])]);
  await db.query(`insert into content_modules(id,type,title,image_url,mobile_image_url,status,payload) values
    ('b1','banner','Banner','/api/media/${U(10)}',null,'published','{}'),
    ('b2','banner','Banner 2',null,null,'draft',$1::jsonb)`, [JSON.stringify({ note: `/api/media/${U(12)}` })]);
  await db.query(`insert into categories(slug,name,image_url) values ('cat','Cat','/api/media/${U(11)}')`);

  // What is used: books (file and cover), the order snapshot, banners, payloads, categories. Missing optional tables are fine.
  const used = await usedPaths(sql);
  for (const p of [product('current-addon', 1), product('current-addon', 2), product('current-addon', 4, 'cover'), media(10), media(11), media(12)]) assert.ok(used.has(p), `${p} is in use`);
  for (const p of [product('current-addon', 3), product('gone-addon', 5), media(13)]) assert.ok(!used.has(p), `${p} is unused`);

  const report = await storageReport(sql, api, now);
  assert.equal(report.total.files, files.length);
  assert.equal(report.total.bytes, files.reduce((s, f) => s + f.size, 0));
  assert.deepEqual(report.unused.map((f) => f.pathname), [product('gone-addon', 5), product('current-addon', 3), media(13)], 'unused files, largest first');
  assert.equal(report.recent, 1, 'a file under an hour old is skipped, not listed');
  assert.equal(report.unusedBytes, 8000 + 4000 + 700);
  assert.equal(report.byKind.cover.files, 1); assert.equal(report.byKind.image.files, 4);

  // Releasing after a replace: the old file goes only when nothing uses it
  assert.equal(await releasePaths(sql, api, [product('current-addon', 1)]), 0, 'the current file is kept');
  assert.equal(await releasePaths(sql, api, [product('current-addon', 2)]), 0, 'a file a customer bought is kept');
  assert.equal(await releasePaths(sql, api, ['somewhere/else.txt', 'admin/other/x']), 0, 'only managed paths are ever touched');
  await db.query(`update books set file_url=$1 where slug='current-addon'`, [blobUrl(product('current-addon', 6))]);
  assert.equal(await releasePaths(sql, api, [product('current-addon', 1), product('current-addon', 2)]), 1, 'the replaced file is removed, the sold one stays');
  assert.deepEqual(deleted, [product('current-addon', 1)]);

  // "Delete unused files" removes exactly the unused, aged files
  deleted.length = 0;
  const result = await deleteUnused(sql, api, now);
  assert.deepEqual(result, { deleted: 4, bytes: 8000 + 4000 + 700 + 1000 }, 'now includes the replaced file, and still not the sold one');
  assert.ok(!deleted.includes(blobUrl(product('current-addon', 2))) && !deleted.includes(blobUrl(media(10))) && !deleted.includes(blobUrl(product('current-addon', 6))));
  assert.equal((await deleteUnused(sql, api, now)).deleted, 0, 'nothing left to delete');

  // Deleting the banner frees its image; an image used elsewhere stays
  await db.query(`delete from content_modules where id='b1'`);
  assert.equal(await releasePaths(sql, api, [media(10), media(11)]), 1, 'the banner image goes, the category image stays');
  assert.deepEqual(deleted.slice(-1), [media(10)]);
} finally { await db.close(); }

console.log('Storage checks passed: used files found (books, orders, banners, payloads, categories), unused listed and removed, sold files and fresh uploads kept.');
