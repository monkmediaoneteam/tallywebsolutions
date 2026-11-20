import assert from 'node:assert/strict';
import { load } from './test-commerce.mjs';
import { createIsolatedDatabase } from './isolated-db.mjs';

const hs = load('src/lib/home-sections.ts');
const ops = load('src/lib/home-layout-ops.ts');
const theme = load('src/lib/theme.ts');
const { SECTION_TYPES, cleanValue, cleanSettings, cleanLayout, cleanSection, defaultLayout, resolveLayout, sectionFrame, typeOf, SectionError, MAX_SECTIONS } = hs;
const field = (type, id) => typeOf(type).fields.find(f => f.id === id);

// ---- the registry itself is well formed: one definition per type, every field has a valid default
assert.equal(new Set(SECTION_TYPES.map(t => t.id)).size, SECTION_TYPES.length, 'type ids are unique');
for (const t of SECTION_TYPES) {
  const ids = new Set();
  for (const f of [...t.fields, ...(t.blocks?.fields ?? [])]) {
    assert.ok(!ids.has(f.id + (t.blocks?.fields.includes(f) ? '#b' : '')), `${t.id}.${f.id} is unique`);
    ids.add(f.id + (t.blocks?.fields.includes(f) ? '#b' : ''));
    assert.doesNotThrow(() => cleanValue(f, f.default, true), `${t.id}.${f.id} default passes its own validation`);
    assert.ok(['Content', 'Layout', 'Mobile', 'Image', 'Colours', 'Section'].includes(f.group), `${t.id}.${f.id} is in a known group`);
  }
  for (const d of t.blocks?.defaults ?? []) assert.doesNotThrow(() => cleanSettings(t.blocks.fields, d, true));
}

// ---- validation: accepts valid, strips unknown, rejects bad values
const o = typeOf('image-overlay').fields;
assert.deepEqual(cleanSettings(o, { heading: ' Hi ', overlay_opacity: '40', text_color: '#ABC', bogus: 1, __proto__x: 2 }, true), { heading: 'Hi', overlay_opacity: 40, text_color: '#abc' }, 'valid values pass, unknown keys are dropped');
for (const bad of ['red', '#12', '#12345g', 'rgb(0,0,0)', 'url(x)', '#ffffff;}</style>']) assert.throws(() => cleanValue(field('rich-text', 'text_color'), bad, true), SectionError, `colour ${bad}`);
assert.equal(cleanValue(field('rich-text', 'text_color'), '', true), '', 'an empty colour means the theme colour');
for (const bad of ['javascript:alert(1)', 'http://x.com', '//evil.com', 'data:text/html,x', '/a b', '/a"onload=1', 'mailto:a@b.c']) assert.throws(() => cleanValue(field('rich-text', 'button_url'), bad, true), SectionError, `url ${bad}`);
for (const ok of ['/search?x=1', 'https://example.com/a?b=1', '']) assert.equal(cleanValue(field('rich-text', 'button_url'), ok, true), ok);
for (const bad of ['/assets/x.png', 'http://x.com/a.png', 'javascript:1', '/api/other/1', '//x.com/a.png']) assert.throws(() => cleanValue(field('image-overlay', 'image'), bad, true), SectionError, `image ${bad}`);
for (const ok of ['/api/media/abc', 'https://cdn.example.com/a.png', '']) assert.equal(cleanValue(field('image-overlay', 'image'), ok, true), ok);
for (const bad of [-1, 91, 33.5, 'x', NaN, null]) assert.throws(() => cleanValue(field('image-overlay', 'overlay_opacity'), bad, true), SectionError, `range ${bad}`);
assert.throws(() => cleanValue(field('image-overlay', 'height_desktop'), '1000px', true), SectionError, 'selects only accept their options');
assert.throws(() => cleanValue(field('image-overlay', 'content_position'), 'middle', true), SectionError, '3x3 positions only');
assert.throws(() => cleanValue(field('rich-text', 'heading'), 'x'.repeat(121), true), SectionError, 'text is capped');
assert.throws(() => cleanValue(field('rich-text', 'description'), 'x'.repeat(3001), true), SectionError, 'textarea is capped');
assert.equal(cleanValue(field('rich-text', 'heading'), 'a\u0000b\nc', true), 'ab c', 'control characters and newlines are removed from one-line text');
assert.equal(cleanValue(field('image-text', 'rounded_image'), 'on', true), true);
// lenient mode (rendering a saved layout) falls back to defaults instead of throwing
assert.equal(cleanValue(field('image-overlay', 'overlay_opacity'), 500, false), 35);
assert.equal(cleanValue(field('rich-text', 'text_color'), 'red', false), '');

// ---- layout validation
const section = (type, extra = {}) => ({ id: `${type}-1`, type, enabled: true, settings: {}, ...extra });
assert.throws(() => cleanLayout({ sections: Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => section('rich-text', { id: `r${i}` })) }, true), /at most 40/, 'max 40 sections');
assert.equal(cleanLayout({ sections: Array.from({ length: 60 }, (_, i) => section('rich-text', { id: `r${i}` })) }, false).sections.length, MAX_SECTIONS, 'lenient caps at 40 too');
assert.throws(() => cleanLayout({ sections: [section('nope')] }, true), /Unknown section type/);
assert.throws(() => cleanLayout({ sections: [section('faq'), section('faq', { id: 'faq-2' })] }, true), /only be on the page once/);
assert.throws(() => cleanLayout({ sections: [section('rich-text'), section('rich-text')] }, true), /share the id/);
assert.throws(() => cleanLayout({ sections: [section('banner-slot', { id: 'a', settings: { position: 'home-before-faq' } }), section('banner-slot', { id: 'b', settings: { position: 'home-before-faq' } })] }, true), /same position/);
assert.equal(cleanLayout({ sections: [section('nope'), section('rich-text', { settings: { heading: 'ok', evil: '<script>' } })] }, false).sections.length, 1, 'lenient drops what it cannot read');
assert.deepEqual(cleanSection(section('rich-text', { settings: { evil: 1, heading: 'x' } }), true).settings, { heading: 'x' });
const tooMany = typeOf('faq').blocks.max + 1;
assert.throws(() => cleanSection(section('faq', { blocks: Array.from({ length: tooMany }, () => ({ settings: { question: 'q' } })) }), true), /at most/, 'blocks are capped');
assert.equal(cleanSection(section('faq', { blocks: [{ id: 'A b', settings: { question: 'q', answer: 'a', junk: 1 } }] }), true).blocks[0].settings.junk, undefined);

// ---- the default layout reproduces today's homepage, section for section
const today = ['top', 'quick-links', 'categories', 'banner-slot:home-after-categories', 'rails', 'banner-slot:home-after-products', 'look-inside', 'languages', 'developers', 'publish', 'banner-slot:home-before-faq', 'faq'];
const key = s => s.type === 'banner-slot' ? `banner-slot:${s.settings.position}` : s.type;
assert.deepEqual(resolveLayout(undefined).map(key), today, 'no saved layout: the default order');
assert.deepEqual(resolveLayout({ junk: true }).map(key), today, 'a damaged saved layout falls back to the default');
assert.deepEqual(defaultLayout().sections.map(s => s.id), ['top', 'quick-links', 'categories', 'slot-after-categories', 'rails', 'slot-after-products', 'look-inside', 'languages', 'developers', 'publish', 'slot-before-faq', 'faq']);
const dflt = resolveLayout(null);
assert.ok(dflt.every(s => s.enabled));
assert.equal(dflt.find(s => s.type === 'faq').blocks.length, 6, 'the six questions the page shows today');
assert.deepEqual(dflt.find(s => s.type === 'quick-links').blocks.map(b => b.settings.label), ['Bestsellers', 'New arrivals', 'Offers', 'Under ₹199', 'TDL files', 'All add-ons']);
assert.equal(dflt.find(s => s.type === 'categories').settings.heading, 'Browse by category');
assert.equal(dflt.find(s => s.type === 'publish').settings.heading, 'Sell your Tally add-on with us');
assert.equal(dflt.find(s => s.type === 'rails').settings.limit, 12);
// a default section draws no wrapper styling at all: it looks exactly like before
for (const s of dflt) assert.deepEqual(sectionFrame(s.settings), { className: 'hs', style: {} }, `${s.type} default frame is bare`);
assert.ok(!/(book|novel|author|read)/i.test(JSON.stringify(SECTION_TYPES.filter(t => t.id !== 'languages' && t.id !== 'developers').map(t => [t.label, t.description, t.fields.map(f => [f.label, f.default, f.help])]))), 'Tally wording: no book words');

// ---- resolution with disabled, reordered, duplicated sections
let layout = defaultLayout();
layout = ops.toggleSection(layout, 'languages');
layout = ops.moveSection(layout, 'faq', 'up');
layout = ops.moveSection(layout, 'faq', 'up');
const dup = ops.addSection(layout, 'rich-text');
layout = ops.duplicateSection(dup.layout, dup.id).layout;
const resolved = resolveLayout(layout);
assert.equal(resolved.find(s => s.id === 'languages').enabled, false, 'a switched-off section stays in the list but is marked disabled');
const order = resolved.map(s => s.id);
assert.ok(order.indexOf('faq') === order.indexOf('publish') - 1 && order.indexOf('publish') < order.indexOf('slot-before-faq'), 'moved up twice');
const rich = resolved.filter(s => s.type === 'rich-text');
assert.equal(rich.length, 2); assert.notEqual(rich[0].id, rich[1].id, 'a duplicate gets its own id');
assert.equal(rich[1].settings.heading, rich[0].settings.heading, 'a duplicate keeps the settings');
assert.throws(() => ops.duplicateSection(layout, 'faq'), /only be on the page once/);
assert.throws(() => ops.removeSection(layout, 'top'), /cannot be deleted/);
assert.equal(ops.removeSection(layout, 'faq').sections.some(s => s.id === 'faq'), false);
assert.throws(() => ops.addSection(layout, 'faq'), /already on the page/);
assert.throws(() => ops.moveSection(layout, 'ghost', 'up'), /no longer exists/);
assert.equal(ops.moveSection(layout, 'top', 'up'), layout, 'moving the first section up changes nothing');
// banner slots: a free position is chosen; once all are used no more can be added
let full = defaultLayout();
assert.throws(() => ops.addSection(full, 'banner-slot'), /Every banner position/);
full = ops.removeSection(full, 'slot-before-faq');
assert.equal(ops.addSection(full, 'banner-slot').layout.sections.at(-1).settings.position, 'home-before-faq');
// saving one section is strict
const saved = ops.saveSection(layout, dup.id, { settings: { heading: 'Hello', text_color: '#fff', evil: 1 } });
assert.equal(saved.sections.find(s => s.id === dup.id).settings.heading, 'Hello');
assert.equal(saved.sections.find(s => s.id === dup.id).settings.evil, undefined);
assert.throws(() => ops.saveSection(layout, dup.id, { settings: { text_color: 'blue' } }), /Text: must be a colour/);
const faqSaved = ops.saveSection(layout, 'faq', { settings: { heading: 'FAQ' }, blocks: [{ id: 'q1', settings: { question: 'Why?', answer: 'Because.' } }] });
assert.equal(resolveLayout(faqSaved).find(s => s.id === 'faq').blocks.length, 1, 'an explicit block list replaces the defaults');
assert.equal(resolveLayout(ops.saveSection(layout, 'faq', { settings: {}, blocks: [] })).find(s => s.id === 'faq').blocks.length, 0, 'deleting every question is respected');

// ---- how common settings reach the page
const frame = sectionFrame({ ...hs.defaultsOf(typeOf('rich-text').fields), text_color: '#222222', background: '#eeeeee', background_2: '#dddddd', custom_spacing: true, pad_top: 20, pad_bottom: 100,
  divider: true, full_width: true, rounded: true, button_bg: '#ff0000', highlight: '#00ff00', heading_size: 'large' });
assert.equal(frame.style['--hs-pt'], '20px'); assert.equal(frame.style['--hs-pb'], '100px');
assert.equal(frame.style.background, 'linear-gradient(135deg, #eeeeee, #dddddd)'); assert.equal(frame.style['--hs-text'], '#222222'); assert.equal(frame.style['--hs-btn-bg'], '#ff0000');
for (const c of ['hs-text', 'hs-bg', 'hs-pad', 'hs-divider', 'hs-full', 'hs-round', 'hs-btn-bg', 'hs-hl', 'hs-hs']) assert.ok(frame.className.split(' ').includes(c), c);
assert.equal(sectionFrame({ custom_spacing: false, pad_top: 99 }).style['--hs-pt'], undefined, 'spacing sliders only count while custom spacing is on');
assert.deepEqual(sectionFrame({ text_color: 'red;}</style>' }).style, {}, 'a bad colour never reaches the page');

// ---- theme
assert.deepEqual(theme.cleanTheme({ brand: '#ABCDEF', ink: '#15151f', max_width: '1440', evil: 'x' }, true), { brand: '#abcdef', max_width: '1440' }, 'defaults are not stored, unknown keys dropped');
assert.equal(theme.cleanTheme({ brand: '#abc' }, true).brand, '#aabbcc', 'short hex is expanded');
for (const bad of [{ brand: 'red' }, { brand: '#abcd' }, { max_width: '9999' }, { radius: 'huge' }, { button: 'url(x)' }]) assert.throws(() => theme.cleanTheme(bad, true), theme.ThemeError);
assert.deepEqual(theme.cleanTheme({ brand: 'red', radius: 'soft' }, false), { radius: 'soft' }, 'lenient drops bad values');
assert.equal(theme.themeCss(undefined), '', 'an untouched theme injects nothing');
assert.equal(theme.themeCss({ bogus: 'x' }), '');
const css = theme.themeCss({ brand: '#112233', button: 'square', radius: 'soft', max_width: '1280', tracking: 'wide', ink: '#000000', bg: '#fafafa', link: '#0000ee' });
for (const part of ['--brand:#112233', '--color-brand:#112233', '--btn-radius:2px', '--container:1280px', '--radius-2:16px', '--heading-tracking:0.005em', '--color-bg:#fafafa', '--link:#0000ee']) assert.ok(css.includes(part), part);
const hostile = theme.themeCss({ brand: '#fff;}body{display:none}</style><script>', radius: 'x;}', max_width: '1280;}', button: '999px;}' });
assert.equal(hostile, '', 'hostile values produce no CSS');
assert.match(css, /^[\w\s:#;,.%()\-{}>]+$/, 'output holds only safe characters');
assert.ok(!/[<"'\\]/.test(css));
assert.ok(theme.contrast('#000000', '#ffffff') > 20.9 && theme.contrast('#777777', '#777777') === 1);
assert.deepEqual(theme.themeWarnings(theme.themeValues(null)), [], 'the default theme is readable');
assert.equal(theme.themeWarnings({ ...theme.themeValues(null), ink: '#cccccc' }).length, 1, 'light text on white warns');
assert.ok(theme.themeWarnings({ ...theme.themeValues(null), brand: '#ffff99' })[0].includes('White button text'));

// ---- storage: a missing table falls back to defaults; a real database round-trips
const mkSql = (db) => Object.assign((strings, ...values) => db.query(strings.reduce((a, p, i) => a + (i ? `$${i}` : '') + p, ''), values).then(r => r.rows), {});
const missing = load('src/lib/site-settings.ts', { './db': { sql() { return Promise.reject(Object.assign(new Error('relation "site_settings" does not exist'), { code: '42P01' })); } }, react: { cache: fn => fn } });
assert.deepEqual(await missing.getSiteSettings(), {}, 'missing table: no saved settings, no throw');
assert.deepEqual(await missing.readSiteSetting('theme'), { value: null, missing: true });
const broken = load('src/lib/site-settings.ts', { './db': { sql() { return Promise.reject(new Error('boom')); } }, react: { cache: fn => fn } });
const quiet = console.error; console.error = () => {};
assert.deepEqual(await broken.getSiteSettings(), {}, 'any read failure still renders the defaults');
console.error = quiet;
assert.equal(resolveLayout((await missing.getSiteSettings()).home_layout).length, 12, 'and the page gets the default layout');

const { db } = await createIsolatedDatabase();
try {
  const store = load('src/lib/site-settings.ts', { './db': { sql: mkSql(db) }, react: { cache: fn => fn } });
  assert.deepEqual(await store.getSiteSettings(), {}, 'migration applied, nothing saved yet');
  const edited = ops.saveSection(ops.toggleSection(defaultLayout(), 'faq'), 'categories', { settings: { heading: 'Shop by topic', tile_width: 240 } });
  await store.saveSiteSetting('home_layout', edited);
  await store.saveSiteSetting('theme', theme.cleanTheme({ brand: '#123456' }, true));
  const back = await store.getSiteSettings();
  const layoutBack = resolveLayout(back.home_layout);
  assert.equal(layoutBack.find(s => s.id === 'faq').enabled, false);
  assert.equal(layoutBack.find(s => s.id === 'categories').settings.heading, 'Shop by topic');
  assert.equal(layoutBack.find(s => s.id === 'categories').settings.tile_width, 240);
  assert.equal(theme.themeValues(back.theme).brand, '#123456');
  await store.saveSiteSetting('theme', { brand: '#654321' });
  assert.equal((await db.query(`select count(*)::int n from site_settings where key='theme'`)).rows[0].n, 1, 'saving again updates the one row');
  assert.equal((await store.readSiteSetting('theme')).value.brand, '#654321');
  await store.deleteSiteSetting('home_layout');
  assert.equal(resolveLayout((await store.getSiteSettings()).home_layout).length, 12, 'reset returns the default layout');
  await db.exec(await (await import('node:fs/promises')).readFile(new URL('../migrations/013-site-settings.sql', import.meta.url), 'utf8'));
} finally { await db.close(); }
console.log('Homepage section checks passed: schema validation, default layout, ops, frame styles, theme, storage.');
