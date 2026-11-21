import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { load } from './test-commerce.mjs';

const sections = load('src/lib/banner-sections.ts');
const { validateContent } = load('src/lib/content.ts', { './db': { sql() { throw Error('No database in banner tests'); } } });
const { bannerSections, sectionsAt } = load('src/lib/home.ts', { './db': { sql() { throw Error('No database in banner tests'); } } });
const { bannerState } = load('src/app/admin/banners/banner-state.ts');
const now = new Date('2026-11-21T12:00:00Z');
const module = (id, type, extra = {}) => ({ id, type, title: id, sort: 0, status: 'published',
  image_url: null, mobile_image_url: null, link_url: null, body: null, link_label: null, payload: {}, publish_at: null, ends_at: null, ...extra });
const payload = (position, extra = {}) => ({ key: 'test-slot', position, layout: 'grid', max: '2', columns: '3',
  width: '1000', height: '1000', mobile_width: '600', mobile_height: '800', autoplay: '0', enabled: 'on', empty: 'hide', fit: 'contain', ...extra });
for (const position of Object.keys(sections.POSITIONS)) {
  const p = payload(position);
  const section = module('slot', 'banner-section', { payload: p });
  const banners = [0, 1, 2].map(i => module('banner-' + i, 'banner', { sort: i, image_url: '/banners/test.png', payload: { placement: p.key } }));
  const input = { ...section };
  assert.equal(sections.bannerInputError(input), null);
  validateContent('modules', input);
  const placed = sectionsAt(bannerSections([section, ...banners], now), position).find(s => s.section.key === p.key);
  assert.equal(placed.banners.length, 2);
  assert.equal(placed.section.columns, 3);
  assert.equal(placed.section.fit, 'contain');
  assert.equal(sections.ratio(placed.section.width, placed.section.height), '1000 / 1000');
  assert.equal(bannerSections([{ ...section, payload: { ...p, enabled: 'off' } }, ...banners], now).some(s => s.section.key === p.key), false);
  assert.equal(bannerSections(banners, now).some(s => s.section.key === p.key), false, 'deleted section keeps banners but does not render them');
}
for (const def of sections.DEFAULT_SECTIONS) {
  const override = module('override', 'banner-section', { payload: payload(def.position, { key: def.key, width: '800', height: '800' }) });
  assert.equal(sections.mergeSections([override]).find(s => s.key === def.key).width, 800);
  assert.deepEqual(sections.mergeSections([]).find(s => s.key === def.key), def, 'reset restores built-in defaults');
}
const future = module('future', 'banner', { image_url: '/banners/test.png', payload: { placement: 'hero' }, publish_at: '2030-01-01T00:00:00Z' });
assert.equal(bannerState(future, +now).label, 'Scheduled');
assert.equal(bannerSections([future], now).flatMap(s => s.banners).length, 0);
assert.equal(sections.toIndiaInput('2026-11-21T20:00:00Z'), '2026-11-22T01:30');
const valid = { type: 'banner-section', title: 'Valid', sort: '0', status: 'published', payload: payload(Object.keys(sections.POSITIONS)[0]) };
assert.match(sections.bannerInputError(valid, 'old-key'), /cannot be changed/);
for (const sort of [-1001, 1001, 1.5]) assert.ok(sections.bannerInputError({ ...valid, sort }));
for (const [key, value] of [['key', 'new'], ['position', 'unknown'], ['layout', 'unknown'], ['max', '13'], ['columns', '5'],
  ['width', '199'], ['height', '99'], ['mobile_width', '4001'], ['mobile_height', '4001'], ['autoplay', '61'], ['enabled', 'yes'], ['empty', 'unknown']]) {
  assert.throws(() => validateContent('modules', { ...valid, payload: { ...valid.payload, [key]: value } }), key);
}
for (const url of ['https://images.example.test/a.webp', '/api/media/12345678-1234-1234-1234-123456789abc', '/banners/test.svg']) assert.equal(sections.bannerImageUrl(url), true, url);
for (const url of ['http://example.test/a.png', '//evil.test/a', '/api/media/no', '/banners/../secret.png', '/other/file.png', 'https://user:pass@example.test/x', 'javascript:alert(1)']) assert.equal(sections.bannerImageUrl(url), false, url);
assert.ok(sections.bannerInputError({ type: 'banner', payload: {}, image_url: '/banners/test.png' }));
assert.equal(sections.bannerInputError({ type: 'banner', payload: { placement: 'hero' }, image_url: '' }), 'Add an image for this banner.');
assert.throws(() => validateContent('modules', { title: 'Schedule', type: 'banner', image_url: '/banners/test.png',
  publish_at: '2026-11-21T12:00:00+05:30', ends_at: '2026-11-21T11:59:00+05:30' }));
console.log('Banner controls: all eight positions, limits, max, enabled, deletion, reset, schedule, IST, immutable keys and image URL rules passed.');

// Invoke the actual ActionForm handler with controlled browser boundaries.
const formSource = readFileSync(new URL('../src/components/ActionForm.tsx', import.meta.url), 'utf8');
const formCode = ts.transpileModule(formSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const require = createRequire(import.meta.url);
const formModule = { exports: {} };
let refreshes = 0;
new Function('require', 'module', 'exports', formCode)(name => name === 'react'
  ? { useState: initial => [initial, () => {}] }
  : name === 'next/navigation' ? { useRouter: () => ({ refresh() { refreshes++; }, push() {} }) }
  : require(name), formModule, formModule.exports);
const formElement = formModule.exports.default({ action: '/api/admin/platform/content', children: null });
const globals = { fetch: globalThis.fetch, FormData: globalThis.FormData, HTMLButtonElement: globalThis.HTMLButtonElement };
let requests = 0;
try {
  globalThis.fetch = async () => { requests++; return { ok: true, redirected: false }; };
  globalThis.HTMLButtonElement = class {};
  globalThis.FormData = class { has() { return false; } };
  for (const native of [false, true]) {
    await formElement.props.onSubmit({ defaultPrevented: !native, nativeEvent: { defaultPrevented: native },
      preventDefault() { throw Error('Already cancelled'); }, get currentTarget() { throw Error('Cancelled form must not be read'); } });
  }
  assert.equal(requests, 0, 'ImageField cancellation stops ActionForm explicit fetch');
  let prevented = false;
  await formElement.props.onSubmit({ defaultPrevented: false, nativeEvent: { defaultPrevented: false, submitter: null },
    preventDefault() { prevented = true; }, currentTarget: {} });
  assert.equal(prevented, true); assert.equal(requests, 1); assert.equal(refreshes, 1, 'Uncancelled save still fetches and refreshes');
} finally {
  for (const [key, value] of Object.entries(globals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
assert.match(sections.DEFAULT_SECTIONS.find(s => s.key === 'product').position, /-below-tabs$/, 'Default product/book banner follows the tabs');
console.log('ActionForm actual-handler cancellation and below-tabs banner defaults passed.');
