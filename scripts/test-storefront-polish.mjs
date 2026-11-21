// Offline T5/T6 regressions: real components/validation, mocked UI boundaries; no DB or env files.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const tally = existsSync(path.join(root, 'src/app/(store)/products/[slug]/page.tsx'));
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const dep = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.includes('/db') || name === './db') throw new Error('Database access forbidden');
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? 'src/' + name.slice(2) : path.relative(root, path.resolve(path.dirname(path.join(root, file)), name));
      for (const ext of ['.ts', '.tsx']) if (existsSync(path.join(root, base + ext))) return load(base + ext, mocks);
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', code)(dep, module, module.exports);
  return module.exports;
}
const Stub = ({ children }) => React.createElement('span', null, children);
const empty = { __esModule: true, default: () => null };
const cardMocks = {
  'next/link': { __esModule: true, default: ({ children, href }) => React.createElement('a', { href }, children) },
  './AddToCart': empty, './Cover': empty, './WishlistButton': empty,
  './ProductTile': empty, './motion/Book3D': empty,
  './motion/Morph': { __esModule: true, default: Stub, morphName: s => s },
  '@/lib/store': { isStoreOwned: () => false },
};
const Card = load('src/components/BookCard.tsx', cardMocks).default;
const book = { slug: 'future', title: 'Future title', price: 10000, regular: 10000,
  saving: 0, onSale: false, saleable: false, saveable: true, comingSoon: true };
const renderCard = extra => renderToStaticMarkup(React.createElement(Card, { book: { ...book, ...extra }, enabled: true }));
assert.doesNotMatch(renderCard({}).replace(/<dialog\b[\s\S]*?<\/dialog>/g, ''), /Coming soon/i, 'future cards have no Coming soon flag or price chip');
assert.match(renderCard({}), /<dialog[\s\S]*Coming soon/, 'quick-view details keep availability information');
assert.match(renderCard({ offers: ['Launch offer'] }), /Launch offer/, 'offer badge remains');
assert.match(renderCard({ saleable: true, onSale: true, regular: 20000, saving: 10000 }), /50% off/, 'discount badge remains');
const Price = load('src/components/Price.tsx').default;
assert.match(renderToStaticMarkup(React.createElement(Price, { book, size: 'page' })), /Coming soon/, 'detail availability remains');
assert.match(read('src/lib/home.ts'), /title: "Coming soon"/, 'legitimate rail heading remains');

// Exercise handlers with controlled hooks: selected state, focus, wrap, prevent scrolling.
let state = 0, focus = -1;
const refs = { current: [] };
const Tabs = load('src/components/product/BookTabs.tsx', { react: {
  ...React, useState: () => [state, n => { state = n; }], useRef: () => refs,
} }).default;
const tabs = ['about', 'contents', 'details'].map(id => ({ id, label: id, content: id + ' panel' }));
function tree() {
  const result = Tabs({ tabs });
  result.props.children[0].props.children.forEach((button, i) => button.props.ref({ focus: () => { focus = i; } }));
  return result;
}
function press(index, key, expected) {
  const button = tree().props.children[0].props.children[index];
  let prevented = false;
  button.props.onKeyDown({ key, preventDefault: () => { prevented = true; } });
  assert.equal(state, expected); assert.equal(focus, expected); assert.equal(prevented, true);
  const result = tree();
  const buttons = result.props.children[0].props.children;
  assert.equal(buttons[expected].props['aria-selected'], true);
  assert.equal(buttons[expected].props.tabIndex, 0);
  assert.equal(result.props.children[1][expected].props.hidden, false);
}
press(0, 'ArrowLeft', 2); press(2, 'ArrowRight', 0); press(0, 'End', 2); press(2, 'Home', 0);
assert.equal(Tabs({ tabs: [] }), null);

const pageFile = tally ? 'src/app/(store)/products/[slug]/page.tsx' : 'src/app/(store)/books/[slug]/page.tsx';
const page = read(pageFile);
const source = ts.createSourceFile(pageFile, page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const dateFn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'releasedOn');
assert.ok(dateFn, 'release formatter exists');
const dateCode = ts.transpileModule(dateFn.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const releasedOn = new Function(dateCode + ';return releasedOn;')();
assert.equal(releasedOn('2026-12-02'), '2 Dec 2026');
assert.equal(releasedOn('0026-12-02'), '2 Dec 2026', 'legacy short years remain readable');
assert.equal(releasedOn(null), null);
const below = page.indexOf(tally ? '"product-below-tabs"' : '"book-below-tabs"');
assert.ok(page.indexOf('<BookTabs') < below && below < page.indexOf('{byAuthor.length') && below < page.indexOf('<RecentlyViewed'), 'banner is below tabs before related/recent items');

const route = read(tally ? 'src/app/api/admin/products/route.ts' : 'src/app/api/admin/book/route.ts');
const guards = route.split('\n').filter(line => line.trim().startsWith('if (releaseDate')).join('\n');
const validateDate = new Function('releaseDate', 'PublishingError', guards);
for (const value of ['1999-12-31', '0026-12-02', '2026-02-30', '2026-13-01', 'not-a-date'])
  assert.throws(() => validateDate(value, Error), /release date|full year/i, value);
for (const value of [null, '2000-01-01', '2024-02-29', '2026-12-02']) assert.doesNotThrow(() => validateDate(value, Error));
const css = read('src/styles/polish.css');
assert.match(css, /font: 500 16px/);
assert.match(css, /aria-selected="true"\]::after/);
assert.match(css, /height: auto; aspect-ratio: auto; object-fit: contain/);
assert.match(css, /\.gallery-stage[^}]*background: none/);
assert.ok(tally ? read('src/app/globals.css').includes('polish.css') : page.includes('polish.css'), 'polish CSS is loaded');

const hs = load('src/lib/home-sections.ts');
assert.deepEqual(hs.GROUPS, ['Content', 'Layout', 'Mobile', 'Image', 'Colours', 'Section']);
const imageField = hs.typeOf('image-overlay').fields.find(f => f.id === 'image');
for (const bad of ['/api/media/abc', '/api/media/../x', '/api/media/123e4567-e89b-42d3-a456-426614174000/extra'])
  assert.throws(() => hs.cleanValue(imageField, bad, true), hs.SectionError);
assert.equal(hs.cleanValue(imageField, '/api/media/abc', false), '', 'old malformed saved image safely falls back');
assert.equal(hs.isSafeImage('/api/media/123e4567-e89b-42d3-a456-426614174000'), true);
console.log('T5/T6 polish checks passed: rendered cards, retained headings/offers, keyboard tabs, release dates, admin year/calendar guards, banner order, CSS, image UUIDs.');
