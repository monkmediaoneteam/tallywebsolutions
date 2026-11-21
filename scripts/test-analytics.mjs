import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createIsolatedDatabase } from './isolated-db.mjs';

const source = readFileSync(new URL('../src/lib/analytics.ts', import.meta.url), 'utf8')
  .replace(/import \{ sql \} from "\.\/db";/, 'const sql = { query: (t, p) => globalThis.analyticsQuery(t, p) };');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const A = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const { parseRange, previousRange, getAnalytics, bucketize, weekStart, pctChange, deltaTone, sumRows, csvCell, ordersCsv, exportOrders, todayIndia, QUERY_COUNT } = A;

// ---- ranges: India-time calendar days, inclusive ----
const today = '2026-10-16'; // a Friday
const R = (q) => { const { label, clamped, compare, ...r } = parseRange(q, today); return r; };
assert.deepEqual(R({}), { preset: '30d', from: '2026-09-17', to: today, days: 30 });
assert.deepEqual(R({ range: 'today' }), { preset: 'today', from: today, to: today, days: 1 });
assert.deepEqual(R({ range: '7d' }), { preset: '7d', from: '2026-10-10', to: today, days: 7 });
assert.equal(R({ range: '90d' }).days, 90);
assert.deepEqual(R({ range: 'month' }), { preset: 'month', from: '2026-10-01', to: today, days: 16 });
assert.deepEqual(R({ range: 'last-month' }), { preset: 'last-month', from: '2026-09-01', to: '2026-09-30', days: 30 });
assert.equal(parseRange({ range: 'last-month' }, '2026-01-10').from, '2025-12-01', 'last month crosses the year');
assert.deepEqual(R({ from: '2026-10-01', to: '2026-10-05' }), { preset: 'custom', from: '2026-10-01', to: '2026-10-05', days: 5 });
assert.deepEqual(R({ from: '2026-10-05', to: '2026-10-01' }), { preset: 'custom', from: '2026-10-01', to: '2026-10-05', days: 5 }, 'a backwards range is put in order');
assert.equal(R({ from: '2026-10-01', to: '2026-12-31' }).to, today, 'a range cannot end in the future');
assert.equal(R({ from: '2027-01-01', to: '2027-01-05' }).preset, '30d', 'a range wholly in the future falls back');
for (const bad of [{ from: 'bad', to: '2026-10-01' }, { from: '2026-02-30', to: '2026-03-01' }, { range: 'constructor' }, { range: "7d'; drop table orders;--" }])
  assert.notEqual(parseRange(bad, today).preset, 'custom', 'junk is ignored: ' + JSON.stringify(bad));
assert.equal(parseRange({ range: 'constructor' }, today).preset, '30d');
for (const from of ['2026-99-99', '2026-00-00', '2026-13-01']) {
  assert.doesNotThrow(() => parseRange({ from, to: today }, today), 'invalid calendar input must not crash analytics');
  assert.equal(parseRange({ from, to: today }, today).preset, '30d');
}
const long = parseRange({ from: '2020-01-01', to: '2026-10-01' }, today);
assert.equal(long.days, 400); assert.equal(long.clamped, true); assert.equal(long.to, '2026-10-01'); assert.equal(long.from, '2025-08-28');
assert.equal(parseRange({}, today).compare, true); assert.equal(parseRange({ compare: '0' }, today).compare, false);
assert.deepEqual(previousRange({ from: '2026-10-10', to: today, days: 7 }), { from: '2026-10-03', to: '2026-10-09', days: 7 });
assert.deepEqual(previousRange({ from: today, to: today, days: 1 }), { from: '2026-10-15', to: '2026-10-15', days: 1 });
assert.equal(todayIndia(Date.parse('2026-10-15T20:00:00Z')), '2026-10-16', 'after 18:30 UTC it is already tomorrow in India');
assert.equal(todayIndia(Date.parse('2026-10-15T18:29:00Z')), '2026-10-15');

// ---- buckets ----
assert.equal(weekStart('2026-10-16'), '2026-10-12'); assert.equal(weekStart('2026-10-12'), '2026-10-12'); assert.equal(weekStart('2026-10-18'), '2026-10-12'); assert.equal(weekStart('2026-10-19'), '2026-10-19');
const row = (day, revenue, orders) => ({ day, revenue, orders, items: orders, discount: 0, started: orders, paid: orders, failed: 0, pending: 0, refundedStatus: 0, refunds: 0, refundCount: 0 });
const weeks = bucketize([row('2026-10-11', 5, 1), row('2026-10-12', 10, 1), row('2026-10-18', 20, 2), row('2026-10-19', 40, 1)], true);
assert.deepEqual(weeks.map((b) => [b.day, b.last, b.revenue, b.orders]), [['2026-10-05', '2026-10-11', 5, 1], ['2026-10-12', '2026-10-18', 30, 3], ['2026-10-19', '2026-10-19', 40, 1]]);
assert.equal(bucketize([row('2026-10-11', 5, 1), row('2026-10-12', 10, 1)], false).length, 2);
assert.equal(sumRows([row('a', 100, 2), row('b', 50, 1)]).aov, 50); assert.equal(sumRows([]).aov, 0);

// ---- delta maths ----
assert.equal(pctChange(150, 100), 50); assert.equal(pctChange(50, 100), -50); assert.equal(pctChange(100, 100), 0);
assert.equal(pctChange(0, 0), 0, '0 to 0 is no change'); assert.equal(pctChange(5, 0), null, 'from nothing is "new", never Infinity');
assert.equal(pctChange(1, 3), -66.7); assert.equal(pctChange(0, 40), -100);
assert.equal(deltaTone(10), 'good'); assert.equal(deltaTone(-10), 'bad'); assert.equal(deltaTone(0), 'neutral'); assert.equal(deltaTone(null), 'neutral');
assert.equal(deltaTone(10, false), 'bad'); assert.equal(deltaTone(-10, false), 'good');

// ---- csv ----
assert.equal(csvCell('=1+1'), `"'=1+1"`); assert.equal(csvCell('a "b"'), '"a ""b"""'); assert.equal(csvCell(null), '""');
const csv = ordersCsv([{ id: 'o1', name: '=evil', email: 'a@b.in', phone: null, items: [{ title: 'X' }, { title: 'Y' }], total: 12345, status: 'paid', invoice_no: null, razorpay_payment_id: null, created_at: '2026-10-15', paid_at: null }]);
assert.equal(csv.split('\r\n')[0], 'order_id,name,email,phone,product,amount_inr,status,invoice_no,razorpay_payment_id,created_at,paid_at');
assert.equal(csv.split('\r\n')[1], `"o1","'=evil","a@b.in","","X | Y","123.45","paid","","","2026-10-15",""`);

// ---- database ----
const { db } = await createIsolatedDatabase();
let queries = 0;
globalThis.analyticsQuery = async (text, params) => { queries++; assert.ok(/\$\d/.test(text) || params.length === 0, 'parameterised'); return (await db.query(text, params)).rows; };
try {
  const item = (slug, price, discount = 0) => ({ slug, title: slug.toUpperCase(), price, discount, list_price: price + discount });
  const order = (id, status, ist, items, extra = {}) => db.query(
    `insert into orders(id,email,items,subtotal,total,status,created_at,paid_at,refunded_at,is_dev) values($1,$2,$3::jsonb,$4,$4,$5,$6::timestamptz,$7::timestamptz,$8::timestamptz,$9)`,
    [id, extra.email ?? 'buyer@real.in', JSON.stringify(items), items.reduce((s, i) => s + i.price, 0), status, `${ist}+05:30`,
      ['paid', 'fulfilled', 'refunded'].includes(status) ? `${ist}+05:30` : null, extra.refunded ? `${extra.refunded}+05:30` : null, extra.dev ?? false]);
  await db.exec(`insert into categories(slug,name) values('gst','GST'),('banking','Banking');
    insert into books(slug,title,price_inr,category_slug,sort) values('x','X',20000,'gst',1),('y','Y',10000,'banking',2),('z','Z',30000,'gst',3),('unsold','Unsold',9900,'gst',4);`);
  await order('a', 'fulfilled', '2026-10-15T23:30:00', [item('x', 20000, 5000)], { email: 'new@real.in' });    // 15 Oct India (18:00 UTC)
  await order('b', 'paid', '2026-10-16T00:30:00', [item('x', 20000), item('y', 10000)], { email: 'Old@real.in' }); // 16 Oct India, but 15 Oct UTC
  await order('c', 'created', '2026-10-16T10:00:00', [item('y', 10000)]);
  await order('d', 'payment_failed', '2026-10-14T10:00:00', [item('y', 10000)]);
  await order('e', 'refunded', '2026-10-12T10:00:00', [item('z', 30000)], { refunded: '2026-10-13T09:00:00' });
  await order('dev', 'fulfilled', '2026-10-15T10:00:00', [item('x', 99900)], { dev: true });
  await order('demo', 'fulfilled', '2026-10-15T10:00:00', [item('x', 99900)], { email: 'demo@example.com' });
  await order('old', 'fulfilled', '2026-10-05T10:00:00', [item('x', 10000)], { email: 'old@real.in' });        // previous period; makes old@real.in a returning customer
  await order('prev2', 'fulfilled', '2026-10-08T10:00:00', [item('y', 10000)], { email: 'gone@real.in' });

  const week = parseRange({ range: '7d' }, today); // 10..16 Oct; previous 3..9 Oct
  queries = 0;
  const a = await getAnalytics(week);
  assert.equal(queries, QUERY_COUNT, 'a fixed number of queries per page load'); assert.equal(a.queries, QUERY_COUNT); assert.ok(QUERY_COUNT <= 12);
  const s = a.sales.data;
  const k = s.current;
  assert.deepEqual({ revenue: k.revenue, orders: k.orders, aov: k.aov, items: k.items, discount: k.discount, started: k.started, paid: k.paid, failed: k.failed, pending: k.pending, refunds: k.refunds, refundCount: k.refundCount },
    { revenue: 50000, orders: 2, aov: 25000, items: 3, discount: 5000, started: 5, paid: 2, failed: 1, pending: 1, refunds: 30000, refundCount: 1 },
    'paid revenue only; dev and demo orders excluded; refunded orders are not revenue');
  assert.equal(k.refundedStatus, 1);
  assert.equal(s.previous.revenue, 20000); assert.equal(s.previous.orders, 2); assert.equal(s.previous.aov, 10000);
  assert.equal(s.daily.length, 7, 'every day of the range, including empty ones');
  assert.deepEqual(s.daily.slice(-2).map((d) => [d.day, d.revenue, d.orders]), [['2026-10-15', 20000, 1], ['2026-10-16', 30000, 1]], 'days are India time');
  assert.equal(s.daily.reduce((t, d) => t + d.revenue, 0), k.revenue, 'daily rows add up to the KPI');
  assert.equal(s.buckets.length, 7); assert.equal(s.previousBuckets.length, 7);
  // reconcile with raw SQL
  const [raw] = (await db.query(`select coalesce(sum(total),0)::int rev, count(*)::int n from orders where status in ('paid','fulfilled') and not is_dev and email<>'demo@example.com'
    and coalesce(paid_at,created_at) >= '2026-10-10T00:00:00+05:30' and coalesce(paid_at,created_at) < '2026-10-17T00:00:00+05:30'`)).rows;
  assert.equal(raw.rev, k.revenue); assert.equal(raw.n, k.orders);
  const [started] = (await db.query(`select count(*)::int n from orders where not is_dev and email<>'demo@example.com' and created_at >= '2026-10-10T00:00:00+05:30' and created_at < '2026-10-17T00:00:00+05:30'`)).rows;
  assert.equal(started.n, k.started, 'orders started match the Orders screen filter');

  assert.deepEqual(a.products.data.map((p) => [p.slug, p.units, p.revenue]), [['x', 2, 40000], ['y', 1, 10000]], 'top products by revenue');
  assert.equal(Math.round(a.products.data[0].share), 80);
  assert.deepEqual(a.categories.data.map((c) => [c.name, c.revenue]), [['GST', 40000], ['Banking', 10000]]);
  assert.deepEqual(a.lowSellers.data.rows.map((r) => r.slug), ['z', 'unsold'], 'live products with no paid sales in range');
  assert.equal(a.lowSellers.data.total, 2);
  assert.equal(a.timing.data.weekday.reduce((t, w) => t + w.orders, 0), 2); assert.equal(a.timing.data.hour[23].orders, 1); assert.equal(a.timing.data.hour[0].orders, 1);
  assert.equal(a.timing.data.weekday[3].orders, 1, 'a is Thursday 15 Oct India time'); assert.equal(a.timing.data.weekday[4].orders, 1);
  assert.deepEqual(a.recent.data.map((o) => o.id), ['c', 'b', 'a', 'd', 'e'], 'recent orders, newest first, no dev or demo');
  assert.deepEqual([a.customers.data.fresh, a.customers.data.returning, a.customers.data.previousFresh, a.customers.data.previousReturning], [1, 1, 2, 0],
    'new = first paid order is in range; email case is ignored');
  assert.deepEqual(a.recovery.data, { awaiting: 1, email: 0, payments: 0 });
  assert.equal(a.downloads.data.current, 0); assert.equal(a.wishlist.data.current, 0);
  assert.deepEqual(a.offers.data.rows, []);

  // compare off: no previous figures
  const solo = await getAnalytics(parseRange({ range: '7d', compare: '0' }, today));
  assert.equal(solo.sales.data.previous, null); assert.equal(solo.previous, null); assert.equal(solo.sales.data.current.revenue, 50000);

  // the same range cut into one-day ranges adds up
  let total = 0; for (const d of ['2026-10-15', '2026-10-16']) total += (await getAnalytics(parseRange({ from: d, to: d, compare: '0' }, today))).sales.data.current.revenue;
  assert.equal(total, 50000);

  // 90 days: weekly buckets
  const q = await getAnalytics(parseRange({ range: '90d' }, today));
  assert.equal(q.weekly, true); assert.ok(q.sales.data.buckets.length <= 14); assert.equal(q.sales.data.buckets.reduce((t, b) => t + b.revenue, 0), q.sales.data.current.revenue);
  assert.deepEqual(q.sales.data.previousBuckets.map(b => b.last), q.sales.data.buckets.map(b => b.last), 'comparison points cover the same relative days, including partial weeks');

  // downloads, wishlist, offers
  await db.exec(`insert into downloads(order_id,book_slug,count,last_at) values('a','x',3,'2026-10-15T10:00:00+05:30'),('old','x',2,'2026-10-05T10:00:00+05:30'),('dev','x',9,'2026-10-15T10:00:00+05:30');
    insert into wishlist(reader_id,book_slug,created_at) values('r1','x','2026-10-16T01:00:00+05:30'),('r2','y','2026-10-06T01:00:00+05:30');
    insert into offers(id,name,kind,scope,value,status) values('o1','Twenty','percent','all',20,'active');
    insert into offer_redemptions(offer_id,order_id,email,discount) values('o1','a','buyer@real.in',5000);`);
  const b = await getAnalytics(week);
  assert.equal(b.downloads.data.current, 3, 'dev orders do not count'); assert.equal(b.downloads.data.previous, 2);
  assert.equal(b.wishlist.data.current, 1); assert.equal(b.wishlist.data.previous, 1); assert.equal(b.wishlist.data.spark.length, 7);
  assert.deepEqual(b.offers.data.rows, [{ id: 'o1', name: 'Twenty', uses: 1, given: 5000, revenue: 20000 }]);
  assert.equal(b.offers.data.redemptions.current, 1); assert.equal(b.offers.data.discount.current, 5000);

  // missing optional tables: only those widgets say "not available"
  await db.exec('drop table offer_redemptions; drop table wishlist; drop table email_delivery;');
  const c = await getAnalytics(week);
  assert.equal(c.offers.ok, false); assert.equal(c.wishlist.ok, false); assert.equal(c.recovery.ok, false);
  assert.equal(c.sales.ok, true); assert.equal(c.products.data.length, 2); assert.equal(c.downloads.ok, true);
  await db.exec('alter table books drop column category_slug cascade');
  assert.equal((await getAnalytics(week)).categories.ok, false, 'a missing column is also tolerated');
  await db.exec('drop table downloads');
  assert.equal((await getAnalytics(week)).downloads.ok, false);
  await db.exec(`insert into books(slug,title,price_inr,sort) select 'no-sale-' || n, 'No sale ' || n, 100, n + 100 from generate_series(1,60) n`);
  const many = await getAnalytics(week);
  assert.equal(many.lowSellers.data.rows.length, 50, 'no-sales list is capped at 50');
  assert.equal(many.lowSellers.data.total, 62);

  // export: all orders, or only a range, and dates are validated
  assert.equal((await exportOrders()).length, 9);
  assert.deepEqual((await exportOrders('2026-10-16', '2026-10-16')).map((r) => r.id), ['c', 'b']);
  assert.deepEqual((await exportOrders('2026-10-16', '2026-10-15')).map((r) => r.id).sort(), ['a', 'b', 'c', 'dev', 'demo'].sort());
  assert.equal((await exportOrders("2026-10-16'; drop table orders;--", '2026-10-16')).length, 9, 'a bad date is ignored, never run');
} finally { await db.close(); }
console.log('Analytics checks passed: ranges, clamping, IST buckets, delta maths, aggregation reconciles with raw SQL, previous period, top products, missing tables, CSV.');
