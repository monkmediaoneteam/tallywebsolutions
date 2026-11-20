import { sql } from "./db";

/*
 * Analytics for the admin dashboard.
 *
 * Cost rules (the database is billed by compute and transfer):
 *  - a fixed set of aggregate queries (QUERY_COUNT), run together with Promise.all;
 *  - every query is parameterised, grouped in SQL, and returns a bounded number of rows (at most one per day, or a top-N);
 *  - no per-row follow-up queries.
 * Only real orders count: development checkouts and the demo catalogue's seeded orders are left out.
 * Days are India calendar days (UTC+5:30); money is paise.
 */

export const MAX_DAYS = 400;
export const WEEKLY_AFTER_DAYS = 60;
export const QUERY_COUNT = 12;

export type Range = { preset: string; label: string; from: string; to: string; days: number; compare: boolean; clamped: boolean };
export type Period = { from: string; to: string; days: number };

const PRESETS: Record<string, { days: number; label: string }> = {
  today: { days: 1, label: "Today" }, "7d": { days: 7, label: "Last 7 days" }, "30d": { days: 30, label: "Last 30 days" }, "90d": { days: 90, label: "Last 90 days" },
};
export const PRESET_LINKS: [string, string][] = [["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["month", "This month"], ["last-month", "Last month"]];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
export const shiftDay = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);
const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && shiftDay(v, 0) === v;
/** Today's date in India (UTC+5:30). */
export const todayIndia = (now: number = Date.now()) => new Date(now + 330 * 60000).toISOString().slice(0, 10);

/** The Monday on or before a day (India weeks run Monday to Sunday here). */
export function weekStart(day: string) {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftDay(day, -((dow + 6) % 7));
}

/**
 * Validated range from query params. Anything odd falls back to the last 30 days; a custom range is
 * put in order, cannot end in the future, and is cut to MAX_DAYS (clamped = true).
 */
export function parseRange(q: { range?: string; from?: string; to?: string; compare?: string }, today: string): Range {
  const compare = q.compare !== "0";
  const make = (preset: string, label: string, from: string, to: string, clamped = false): Range => ({ preset, label, from, to, days: spanDays(from, to), compare, clamped });
  if (isDay(q.from) && isDay(q.to)) {
    let [from, to] = q.from <= q.to ? [q.from, q.to] : [q.to, q.from];
    if (from <= today) {
      if (to > today) to = today;
      let clamped = false;
      if (spanDays(from, to) > MAX_DAYS) { from = shiftDay(to, 1 - MAX_DAYS); clamped = true; }
      return make("custom", from === to ? from : `${from} to ${to}`, from, to, clamped);
    }
  }
  const key = q.range ?? "";
  if (key === "month") return make("month", "This month", `${today.slice(0, 8)}01`, today);
  if (key === "last-month") {
    const to = shiftDay(`${today.slice(0, 8)}01`, -1);
    return make("last-month", "Last month", `${to.slice(0, 8)}01`, to);
  }
  const preset = Object.hasOwn(PRESETS, key) ? key : "30d";
  return make(preset, PRESETS[preset].label, shiftDay(today, 1 - PRESETS[preset].days), today);
}

/** The period of equal length that ends the day before this one starts. */
export const previousRange = (r: Period): Period => ({ from: shiftDay(r.from, -r.days), to: shiftDay(r.from, -1), days: r.days });
export const isWeekly = (r: { days: number }) => r.days > WEEKLY_AFTER_DAYS;
export const daysBetween = (from: string, to: string) => Array.from({ length: spanDays(from, to) }, (_, i) => shiftDay(from, i));

// ---------- pure maths ----------

/** Percent change, one decimal. null means "no earlier figure to compare with" (earlier was 0, now is not). */
export function pctChange(now: number, before: number): number | null {
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
}
export type Tone = "good" | "bad" | "neutral";
/** Up is good for sales; for refunds and failures pass goodWhenUp = false. */
export function deltaTone(pct: number | null, goodWhenUp = true): Tone {
  if (pct === null || pct === 0) return "neutral";
  return (pct > 0) === goodWhenUp ? "good" : "bad";
}
export const average = (total: number, count: number) => (count ? Math.round(total / count) : 0);

export const METRICS = ["revenue", "orders", "items", "discount", "started", "paid", "failed", "pending", "refundedStatus", "refunds", "refundCount"] as const;
export type Metric = (typeof METRICS)[number];
export type DayRow = { day: string } & Record<Metric, number>;
export type Bucket = DayRow & { last: string };

const blank = (day: string): Bucket => ({ day, last: day, ...(Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<Metric, number>) });

/** Sums day rows into calendar weeks (Monday start) or leaves them as days. Rows must be in date order. */
export function bucketize(rows: DayRow[], weekly: boolean): Bucket[] {
  const out: Bucket[] = [];
  for (const row of rows) {
    const key = weekly ? weekStart(row.day) : row.day;
    let b = out[out.length - 1];
    if (!b || b.day !== key) { b = blank(key); out.push(b); }
    b.last = row.day;
    for (const m of METRICS) b[m] += row[m];
  }
  return out;
}

export type Totals = Record<Metric, number> & { aov: number };
export function sumRows(rows: DayRow[]): Totals {
  const t = Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<Metric, number>;
  for (const r of rows) for (const m of METRICS) t[m] += r[m];
  return { ...t, aov: average(t.revenue, t.orders) };
}

// ---------- data ----------

export type Unavailable = { ok: false };
export type Section<T> = { ok: true; data: T } | Unavailable;
export type Counted = { current: number; previous: number | null; spark: number[] };
export type ProductRow = { slug: string; title: string; units: number; revenue: number; share: number };
export type CategoryRow = { slug: string; name: string; units: number; revenue: number };
export type OfferRow = { id: string; name: string; uses: number; given: number; revenue: number };
export type RecentOrder = { id: string; name: string | null; email: string; total: number; status: string; at: string };
export type LowSeller = { slug: string; title: string; price: number };

export type Analytics = {
  range: Range; previous: Period | null; weekly: boolean; queries: number;
  sales: Section<{ current: Totals; previous: Totals | null; daily: DayRow[]; buckets: Bucket[]; previousBuckets: Bucket[] }>;
  customers: Section<{ weeks: { week: string; fresh: number; returning: number }[]; fresh: number; returning: number; previousFresh: number | null; previousReturning: number | null }>;
  products: Section<ProductRow[]>;
  categories: Section<CategoryRow[]>;
  timing: Section<{ weekday: { orders: number; revenue: number }[]; hour: { orders: number; revenue: number }[] }>;
  recent: Section<RecentOrder[]>;
  lowSellers: Section<{ total: number; rows: LowSeller[] }>;
  downloads: Section<Counted>;
  wishlist: Section<Counted>;
  offers: Section<{ rows: OfferRow[]; redemptions: Counted; discount: Counted }>;
  recovery: Section<{ awaiting: number; email: number; payments: number }>;
};

// Real orders only. Written once, spliced into each query text (it holds no user input).
const REAL = "not o.is_dev and o.email <> 'demo@example.com'";
const PAID = "o.status in ('paid','fulfilled')";
const PAID_AT = "coalesce(o.paid_at, o.created_at)";
const LO = (p: number) => `($${p}::date::timestamp at time zone 'Asia/Kolkata')`;
const HI = (p: number) => `(($${p}::date + 1)::timestamp at time zone 'Asia/Kolkata')`;
const IST = (col: string) => `(${col} at time zone 'Asia/Kolkata')`;

type Rows = Record<string, unknown>[];
const run = async (text: string, params: unknown[]) => (await (sql as unknown as { query: (t: string, p: unknown[]) => Promise<Rows> }).query(text, params)) as Rows;

/** Postgres "undefined table" (42P01) or "undefined column" (42703): the widget says not available instead of failing the page. */
const isMissing = (e: unknown) => /^(42P01|42703)$/.test(String((e as { code?: string })?.code ?? "")) || /(relation|column) .* does not exist/.test(String((e as Error)?.message ?? ""));
async function section<T>(job: () => Promise<T>): Promise<Section<T>> {
  try { return { ok: true, data: await job() }; } catch (e) { if (isMissing(e)) return { ok: false }; throw e; }
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Day -> value rows into a Counted: totals for the range, the same for the earlier period, and one point per day for a sparkline. */
function counted(rows: { day: string; n: number }[], r: Range, prev: Period | null): Counted {
  const by = new Map(rows.map((x) => [x.day, x.n]));
  const spark = daysBetween(r.from, r.to).map((d) => by.get(d) ?? 0);
  const previous = prev ? daysBetween(prev.from, prev.to).reduce((s, d) => s + (by.get(d) ?? 0), 0) : null;
  return { current: spark.reduce((a, b) => a + b, 0), previous, spark };
}

export async function getAnalytics(r: Range): Promise<Analytics> {
  const prev = r.compare ? previousRange(r) : null;
  const lo = prev ? prev.from : r.from;           // the earliest day any chart needs
  const rangeFrom = r.from, rangeTo = r.to;

  const [sales, customers, products, categories, timing, recent, lowSellers, downloads, wishlist, offerRows, offerDaily, recovery] = await Promise.all([
    // 1. One row per day for the whole window: revenue, orders, items, discount, payment outcomes, refunds.
    section(async () => {
      const rows = await run(`
        with days as (select d::date as day from generate_series($1::date, $2::date, interval '1 day') d),
        paid as (select ${IST(PAID_AT)}::date as day, count(*)::int as orders, coalesce(sum(o.total),0)::float8 as revenue,
            coalesce(sum(jsonb_array_length(o.items)),0)::int as items,
            coalesce(sum((select coalesce(sum((i->>'discount')::int),0) from jsonb_array_elements(o.items) i)),0)::float8 as discount
          from orders o where ${REAL} and ${PAID} and ${PAID_AT} >= ${LO(1)} and ${PAID_AT} < ${HI(2)} group by 1),
        made as (select ${IST("o.created_at")}::date as day, count(*)::int as started, count(*) filter (where ${PAID})::int as paid,
            count(*) filter (where o.status = 'payment_failed')::int as failed, count(*) filter (where o.status = 'created')::int as pending,
            count(*) filter (where o.status = 'refunded')::int as "refundedStatus"
          from orders o where ${REAL} and o.created_at >= ${LO(1)} and o.created_at < ${HI(2)} group by 1),
        refunded as (select ${IST("o.refunded_at")}::date as day, count(*)::int as "refundCount", coalesce(sum(o.total),0)::float8 as refunds
          from orders o where ${REAL} and o.status = 'refunded' and o.refunded_at >= ${LO(1)} and o.refunded_at < ${HI(2)} group by 1)
        select to_char(days.day, 'YYYY-MM-DD') as day, coalesce(paid.revenue,0) as revenue, coalesce(paid.orders,0) as orders, coalesce(paid.items,0) as items,
          coalesce(paid.discount,0) as discount, coalesce(made.started,0) as started, coalesce(made.paid,0) as paid, coalesce(made.failed,0) as failed,
          coalesce(made.pending,0) as pending, coalesce(made."refundedStatus",0) as "refundedStatus", coalesce(refunded.refunds,0) as refunds,
          coalesce(refunded."refundCount",0) as "refundCount"
        from days left join paid on paid.day = days.day left join made on made.day = days.day left join refunded on refunded.day = days.day
        order by days.day`, [lo, rangeTo]);
      const all: DayRow[] = rows.map((x) => ({ day: String(x.day), ...(Object.fromEntries(METRICS.map((m) => [m, num(x[m])])) as Record<Metric, number>) }));
      const daily = all.filter((d) => d.day >= rangeFrom);
      const before = all.filter((d) => d.day < rangeFrom);
      const weekly = isWeekly(r);
      return { current: sumRows(daily), previous: prev ? sumRows(before) : null, daily, buckets: bucketize(daily, weekly), previousBuckets: prev ? bucketize(before, weekly) : [] };
    }),

    // 2. New vs returning customers: a customer is new in the week of their first paid order ever, returning after that.
    section(async () => {
      const rows = await run(`
        with paid as (select lower(o.email) as e, ${IST(PAID_AT)}::date as d from orders o where ${REAL} and ${PAID}),
        first as (select e, min(d) as f from paid group by e),
        cur as (select p.e, p.d, f.f from paid p join first f using (e) where p.d between $1::date and $2::date),
        prv as (select p.e, f.f from paid p join first f using (e) where p.d between $3::date and $4::date)
        select 'week' as kind, date_trunc('week', d)::date::text as k, count(distinct e) filter (where date_trunc('week', f) = date_trunc('week', d))::int as fresh,
          count(distinct e) filter (where date_trunc('week', f) < date_trunc('week', d))::int as returning from cur group by 2
        union all select 'cur', null, count(distinct e) filter (where f >= $1::date)::int, count(distinct e) filter (where f < $1::date)::int from cur
        union all select 'prev', null, count(distinct e) filter (where f >= $3::date)::int, count(distinct e) filter (where f < $3::date)::int from prv
        order by 1, 2`, [rangeFrom, rangeTo, prev?.from ?? rangeFrom, prev?.to ?? rangeFrom]);
      const cur = rows.find((x) => x.kind === "cur"), pv = rows.find((x) => x.kind === "prev");
      return { weeks: rows.filter((x) => x.kind === "week").map((x) => ({ week: String(x.k), fresh: num(x.fresh), returning: num(x.returning) })),
        fresh: num(cur?.fresh), returning: num(cur?.returning), previousFresh: prev ? num(pv?.fresh) : null, previousReturning: prev ? num(pv?.returning) : null };
    }),

    // 3. Top products by revenue, with their share of all product revenue in the range.
    section(async () => (await run(`
      select i->>'slug' as slug, max(i->>'title') as title, count(*)::int as units, coalesce(sum((i->>'price')::int),0)::float8 as revenue,
        sum(sum((i->>'price')::int)) over ()::float8 as total
      from orders o cross join lateral jsonb_array_elements(o.items) i
      where ${REAL} and ${PAID} and ${PAID_AT} >= ${LO(1)} and ${PAID_AT} < ${HI(2)}
      group by 1 order by revenue desc, units desc, slug limit 10`, [rangeFrom, rangeTo]))
      .map((x) => ({ slug: String(x.slug), title: String(x.title ?? x.slug), units: num(x.units), revenue: num(x.revenue), share: num(x.total) ? (num(x.revenue) / num(x.total)) * 100 : 0 }))),

    // 4. Revenue by category (categories and books.category_slug arrived with the marketplace migration).
    section(async () => (await run(`
      select coalesce(c.name, 'Uncategorised') as name, coalesce(c.slug, '') as slug, count(*)::int as units, coalesce(sum((i->>'price')::int),0)::float8 as revenue
      from orders o cross join lateral jsonb_array_elements(o.items) i
        left join books b on b.slug = i->>'slug' left join categories c on c.slug = b.category_slug
      where ${REAL} and ${PAID} and ${PAID_AT} >= ${LO(1)} and ${PAID_AT} < ${HI(2)}
      group by 1, 2 order by revenue desc, name limit 12`, [rangeFrom, rangeTo]))
      .map((x) => ({ slug: String(x.slug), name: String(x.name), units: num(x.units), revenue: num(x.revenue) }))),

    // 5. Day of week and hour of day (India time) of paid orders: at most 7 x 24 rows.
    section(async () => {
      const rows = await run(`
        select extract(isodow from ${IST(PAID_AT)})::int as dow, extract(hour from ${IST(PAID_AT)})::int as hr, count(*)::int as orders, coalesce(sum(o.total),0)::float8 as revenue
        from orders o where ${REAL} and ${PAID} and ${PAID_AT} >= ${LO(1)} and ${PAID_AT} < ${HI(2)} group by 1, 2`, [rangeFrom, rangeTo]);
      const weekday = Array.from({ length: 7 }, () => ({ orders: 0, revenue: 0 })), hour = Array.from({ length: 24 }, () => ({ orders: 0, revenue: 0 }));
      for (const x of rows) {
        const d = weekday[num(x.dow) - 1], h = hour[num(x.hr)];
        if (d) { d.orders += num(x.orders); d.revenue += num(x.revenue); }
        if (h) { h.orders += num(x.orders); h.revenue += num(x.revenue); }
      }
      return { weekday, hour };
    }),

    // 6. The ten most recent orders started in the range, any status (the Orders screen shows the same rows).
    section(async () => (await run(`
      select o.id, o.name, o.email, o.total::float8 as total, o.status, to_char(${IST("o.created_at")}, 'DD Mon, HH24:MI') as at
      from orders o where ${REAL} and o.created_at >= ${LO(1)} and o.created_at < ${HI(2)} order by o.created_at desc limit 10`, [rangeFrom, rangeTo]))
      .map((x) => ({ id: String(x.id), name: (x.name as string) ?? null, email: String(x.email), total: num(x.total), status: String(x.status), at: String(x.at) }))),

    // 7. Live products nobody bought in the range.
    section(async () => {
      const rows = await run(`
        with sold as (select distinct i->>'slug' as slug from orders o cross join lateral jsonb_array_elements(o.items) i
          where ${REAL} and ${PAID} and ${PAID_AT} >= ${LO(1)} and ${PAID_AT} < ${HI(2)})
        select b.slug, b.title, b.price_inr::int as price, count(*) over ()::int as total from books b
        where b.active and not exists (select 1 from sold s where s.slug = b.slug) order by b.sort, b.title limit 10`, [rangeFrom, rangeTo]);
      return { total: num(rows[0]?.total), rows: rows.map((x) => ({ slug: String(x.slug), title: String(x.title), price: num(x.price) })) };
    }),

    // 8. Downloads, dated by each file's most recent download (the downloads table keeps one row per order and file).
    section(async () => counted((await run(`
      select to_char(${IST("d.last_at")}::date, 'YYYY-MM-DD') as day, sum(d.count)::int as n
      from downloads d join orders o on o.id = d.order_id
      where ${REAL} and d.last_at >= ${LO(1)} and d.last_at < ${HI(2)} group by 1`, [lo, rangeTo])).map((x) => ({ day: String(x.day), n: num(x.n) })), r, prev)),

    // 9. Wishlist additions per day.
    section(async () => counted((await run(`
      select to_char(${IST("w.created_at")}::date, 'YYYY-MM-DD') as day, count(*)::int as n from wishlist w
      where w.created_at >= ${LO(1)} and w.created_at < ${HI(2)} group by 1`, [lo, rangeTo])).map((x) => ({ day: String(x.day), n: num(x.n) })), r, prev)),

    // 10. Offers used on paid orders in the range.
    section(async () => (await run(`
      select f.id, f.name, count(*)::int as uses, coalesce(sum(x.discount),0)::float8 as given, coalesce(sum(o.total),0)::float8 as revenue
      from offer_redemptions x join offers f on f.id = x.offer_id join orders o on o.id = x.order_id
      where ${REAL} and ${PAID} and ${PAID_AT} >= ${LO(1)} and ${PAID_AT} < ${HI(2)}
      group by f.id, f.name order by revenue desc, f.name limit 20`, [rangeFrom, rangeTo]))
      .map((x) => ({ id: String(x.id), name: String(x.name), uses: num(x.uses), given: num(x.given), revenue: num(x.revenue) }))),

    // 11. Redemptions and offer discount per day (for the KPI cards and their earlier period).
    section(async () => (await run(`
      select to_char(${IST(PAID_AT)}::date, 'YYYY-MM-DD') as day, count(*)::int as uses, coalesce(sum(x.discount),0)::float8 as given
      from offer_redemptions x join orders o on o.id = x.order_id
      where ${REAL} and ${PAID} and ${PAID_AT} >= ${LO(1)} and ${PAID_AT} < ${HI(2)} group by 1`, [lo, rangeTo]))
      .map((x) => ({ day: String(x.day), uses: num(x.uses), given: num(x.given) }))),

    // 12. What needs attention right now (not tied to the range).
    section(async () => {
      const [x] = await run(`select (select count(*)::int from orders o where o.status = 'paid' and not o.is_dev) as awaiting,
        (select count(*)::int from email_delivery where state in ('pending','sending','manual')) as email,
        (select count(*)::int from payment_attempts where state in ('creating','unknown')) as payments`, []);
      return { awaiting: num(x.awaiting), email: num(x.email), payments: num(x.payments) };
    }),
  ]);

  const offers: Analytics["offers"] = offerRows.ok && offerDaily.ok
    ? { ok: true, data: { rows: offerRows.data,
        redemptions: counted(offerDaily.data.map((x) => ({ day: x.day, n: x.uses })), r, prev),
        discount: counted(offerDaily.data.map((x) => ({ day: x.day, n: x.given })), r, prev) } }
    : { ok: false };

  return { range: r, previous: prev, weekly: isWeekly(r), queries: QUERY_COUNT, sales, customers, products, categories, timing, recent, lowSellers, downloads, wishlist, offers, recovery };
}

// ---------- CSV export of orders ----------

export const ORDER_CSV_COLUMNS = ["order_id", "name", "email", "phone", "product", "amount_inr", "status", "invoice_no", "razorpay_payment_id", "created_at", "paid_at"];

/** Excel treats a leading =, +, - or @ as a formula, so a crafted name could run on the owner's machine; the apostrophe stops that. */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export type ExportRow = { id: string; name: string | null; email: string; phone: string | null; items: { title: string }[] | null; total: number; status: string;
  invoice_no: string | null; razorpay_payment_id: string | null; created_at: unknown; paid_at: unknown };

export function ordersCsv(rows: ExportRow[]): string {
  return [ORDER_CSV_COLUMNS.join(","), ...rows.map((x) => [x.id, x.name, x.email, x.phone, (x.items || []).map((i) => i.title).join(" | "), (x.total / 100).toFixed(2),
    x.status, x.invoice_no, x.razorpay_payment_id, x.created_at, x.paid_at].map(csvCell).join(","))].join("\r\n");
}

/** Every order (as the Orders screen lists them), or only those started in an India-time day range. Dates are validated before use. */
export async function exportOrders(from?: string | null, to?: string | null): Promise<ExportRow[]> {
  const ranged = isDay(from) && isDay(to);
  const [a, b] = ranged ? (from! <= to! ? [from!, to!] : [to!, from!]) : [null, null];
  return (await run(`select o.id, o.name, o.email, o.phone, o.items, o.total, o.status, o.invoice_no, o.razorpay_payment_id, o.created_at, o.paid_at from orders o
    where ($1::date is null or (o.created_at >= ${LO(1)} and o.created_at < ${HI(2)})) order by o.created_at desc`, [a, b])) as unknown as ExportRow[];
}
