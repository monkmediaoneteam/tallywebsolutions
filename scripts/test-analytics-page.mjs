// T1/T3: render the actual async analytics page with real SQL against an isolated DB.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createIsolatedDatabase } from './isolated-db.mjs';

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? require(id), module, module.exports);
  return module.exports;
}
const { db } = await createIsolatedDatabase();
let queries = 0, charts = [];
const sql = { query: async (text, params) => { queries++; return (await db.query(text, params)).rows; } };
const analytics = load('../src/lib/analytics.ts', { './db': { sql } });
const money = load('../src/lib/money.ts');
const component = fn => ({ __esModule: true, default: fn });
const Sparkline = load('../src/components/admin/Sparkline.tsx');
const Page = load('../src/app/admin/analytics/page.tsx', {
  'next/link': component(({ children, href, ...props }) => React.createElement('a', { href, ...props }, children)),
  'next/navigation': { redirect: () => { throw new Error('Unexpected auth redirect'); } },
  '@/lib/admin-auth': { isAdmin: async () => true },
  '@/lib/analytics': analytics, '@/lib/money': money,
  '@/components/AdminShell': component(({ children, title, actions }) => React.createElement('main', null, React.createElement('h1', null, title), actions, children)),
  '@/components/admin/Chart': component(props => { charts.push(props); return React.createElement('canvas', { 'aria-label': props.ariaLabel }); }),
  '@/components/admin/Sparkline': Sparkline,
}).default;
async function render(query = {}) {
  queries = 0; charts = [];
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(query) }));
  assert.equal(queries, 12, 'each page render executes exactly twelve analytics SQL queries');
  assert.doesNotMatch(html, /We could not load this page|do not pay again/i);
  assert.equal((html.match(/data-kpi=/g) || []).length, 12);
  assert.equal((html.match(/<polyline/g) || []).length, 12, 'all twelve cards have a visible trend');
  return html;
}
try {
  assert.match(await render(), /No orders in this range/);
  await db.query('insert into books(slug,title,price_inr) values($1,$2,$3)', ['only-product', 'Only product', 12345]);
  const oneProduct = await render();
  assert.match(oneProduct, /Only product/, 'one product and no orders renders the no-sales widget');
  assert.match(oneProduct, /No orders in this range/);
  const today = analytics.todayIndia();
  const items = JSON.stringify([{ slug: 'only-product', title: 'Only product', price: 12345, discount: 200 }]);
  await db.query(`insert into orders(id,email,items,subtotal,total,status,created_at,paid_at) values('one-paid','real@example.in',$1::jsonb,12345,12345,'paid',now(),now())`, [items]);
  const populated = await render({ from: today, to: today });
  assert.match(populated, /data-kpi="Revenue"[\s\S]*?data-value="true">₹123\.45/);
  assert.match(populated, /data-kpi="Orders"[\s\S]*?data-value="true">1</);
  assert.match(populated, /data-kpi="Discount given"[\s\S]*?₹2/);
  assert.doesNotMatch(populated, /data-kpi="Wishlist adds"/);
  const combo = charts.find(c => c.ariaLabel === 'Revenue and orders over time');
  assert.equal(combo.kind, 'combo');
  assert.deepEqual(combo.series.map(s => [s.label, s.as, s.axis]), [['Orders', 'bar', 'left'], ['Revenue', 'line', 'right'], ['Revenue, previous period', 'line', 'right']]);
  assert.equal(combo.series[2].dashed, true);
  assert.equal(charts.find(c => c.ariaLabel === 'Payment outcomes').kind, 'bar');
  await render({ from: today, to: today, compare: '0' });
  assert.equal(charts.find(c => c.kind === 'combo').series.length, 2);
  await render({ from: '2026-99-99', to: today });
  await db.exec('drop table downloads; drop table offer_redemptions; alter table books drop column category_slug cascade;');
  assert.match(await render(), /Not available for this store yet/);
  console.log('Analytics page render checks passed: empty DB, one product, paid KPI values/trends, combo axes/comparison, payment bars, compare off, malformed dates and missing schema.');
} finally { await db.close(); }
