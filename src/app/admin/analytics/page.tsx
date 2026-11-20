import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { rupees } from "@/lib/money";
import { getAnalytics, parseRange, todayIndia, pctChange, deltaTone, PRESET_LINKS, MAX_DAYS, type Analytics, type Section, type Tone } from "@/lib/analytics";
import AdminShell from "@/components/AdminShell";
import Chart from "@/components/admin/Chart";
import Sparkline from "@/components/admin/Sparkline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics", robots: { index: false, follow: false } };

// Store wording and routes live here so the same screen can serve the sister store.
const WORDS = { items: "add-ons", item: "add-on", itemsTitle: "Products", itemTitle: "Product", editBase: "/admin/products" };

type Query = { range?: string; from?: string; to?: string; compare?: string };
const n = (v: number) => v.toLocaleString("en-IN");
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const TONE: Record<Tone, string> = { good: "text-[#1d6b33]", bad: "text-danger", neutral: "text-ink-soft" };

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-line bg-white p-5">
    <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
    {note && <p className="mt-0.5 text-sm text-ink-soft">{note}</p>}
    <div className="mt-4">{children}</div>
  </section>;
}
const Unavailable = () => <p className="text-sm text-ink-soft">Not available yet. This store has not set up the data behind this section.</p>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-lg bg-bg-2 px-4 py-6 text-center text-sm text-ink-soft">{children}</p>;
function Show<T>({ s, children }: { s: Section<T>; children: (d: T) => React.ReactNode }) { return s.ok ? <>{children(s.data)}</> : <Unavailable />; }

type Card = { label: string; value: string; now: number; before: number | null; hint?: string; spark: number[]; goodWhenUp?: boolean } | { label: string; unavailable: true };

function KpiCard({ c, compare }: { c: Card; compare: boolean }) {
  if ("unavailable" in c) return <div className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-ink-soft">{c.label}</p><p className="mt-2 text-sm text-ink-soft">Not available</p></div>;
  const pct = c.before === null ? undefined : pctChange(c.now, c.before);
  const tone = pct === undefined ? "neutral" : deltaTone(pct, c.goodWhenUp ?? true);
  return <div className="min-w-0 rounded-xl border border-line bg-white p-4" data-kpi={c.label}>
    <p className="text-sm text-ink-soft">{c.label}</p>
    <p className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-[28px]" data-value>{c.value}</p>
    <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 text-xs">
      {compare && pct !== undefined && <span className={`font-medium ${TONE[tone]}`}>{pct === null ? "New" : pct === 0 ? "No change" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`}<span className="sr-only"> compared with the previous period</span></span>}
      {c.hint && <span className="text-ink-soft">{c.hint}</span>}
    </div>
    <div className="mt-2"><Sparkline values={c.spark} /></div>
  </div>;
}

function cards(a: Analytics): Card[] {
  const out: Card[] = [];
  const s = a.sales;
  if (s.ok) {
    const { current: c, previous: p, daily } = s.data;
    out.push(
      { label: "Revenue", value: rupees(c.revenue), now: c.revenue, before: p?.revenue ?? null, spark: daily.map((d) => d.revenue) },
      { label: "Orders", value: n(c.orders), now: c.orders, before: p?.orders ?? null, spark: daily.map((d) => d.orders), hint: "paid" },
      { label: "Average order value", value: rupees(c.aov), now: c.aov, before: p?.aov ?? null, spark: daily.map((d) => (d.orders ? d.revenue / d.orders : 0)) },
      { label: `${WORDS.itemsTitle} sold`, value: n(c.items), now: c.items, before: p?.items ?? null, spark: daily.map((d) => d.items) });
  } else for (const l of ["Revenue", "Orders", "Average order value", `${WORDS.itemsTitle} sold`]) out.push({ label: l, unavailable: true });
  if (a.customers.ok) {
    const c = a.customers.data;
    out.push({ label: "New customers", value: n(c.fresh), now: c.fresh, before: c.previousFresh, spark: c.weeks.map((w) => w.fresh), hint: "first purchase" },
      { label: "Returning customers", value: n(c.returning), now: c.returning, before: c.previousReturning, spark: c.weeks.map((w) => w.returning), hint: "bought before" });
  } else out.push({ label: "New customers", unavailable: true }, { label: "Returning customers", unavailable: true });
  if (s.ok) {
    const { current: c, previous: p, daily } = s.data;
    out.push(
      { label: "Refunds", value: rupees(c.refunds), now: c.refunds, before: p?.refunds ?? null, goodWhenUp: false, spark: daily.map((d) => d.refunds), hint: `${c.refundCount} ${c.refundCount === 1 ? "order" : "orders"}` },
      { label: "Failed payments", value: n(c.failed), now: c.failed, before: p?.failed ?? null, goodWhenUp: false, spark: daily.map((d) => d.failed), hint: `${n(c.pending)} unfinished` });
  } else out.push({ label: "Refunds", unavailable: true }, { label: "Failed payments", unavailable: true });
  const counted = (label: string, sec: Section<{ current: number; previous: number | null; spark: number[] }>, hint?: string): Card =>
    sec.ok ? { label, value: n(sec.data.current), now: sec.data.current, before: sec.data.previous, spark: sec.data.spark, hint } : { label, unavailable: true };
  out.push(counted("Downloads", a.downloads, "by last download"), counted("Wishlist adds", a.wishlist));
  if (a.offers.ok) {
    const o = a.offers.data;
    out.push({ label: "Offer redemptions", value: n(o.redemptions.current), now: o.redemptions.current, before: o.redemptions.previous, spark: o.redemptions.spark },
      { label: "Offer discount given", value: rupees(o.discount.current), now: o.discount.current, before: o.discount.previous, spark: o.discount.spark });
  } else out.push({ label: "Offer redemptions", unavailable: true }, { label: "Offer discount given", unavailable: true });
  return out;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Query> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const range = parseRange(await searchParams, todayIndia());
  const a = await getAnalytics(range);
  const keep: Record<string, string> = range.preset === "custom" ? { from: range.from, to: range.to } : { range: range.preset };
  const href = (extra: Record<string, string>, compare = range.compare) => `/admin/analytics?${new URLSearchParams({ ...extra, ...(compare ? {} : { compare: "0" }) })}`;
  const s = a.sales.ok ? a.sales.data : null;
  const noOrders = !!s && s.current.started === 0 && s.current.orders === 0;
  const fmtBucket = (b: { day: string; last: string }) => a.weekly ? `${dayLabel(b.day)} to ${dayLabel(b.last)}` : dayLabel(b.day);

  return <AdminShell active="analytics" title="Analytics"
    subtitle={`${range.label}${range.preset !== "custom" ? `, ${dayLabel(range.from)} to ${dayLabel(range.to)}` : ""}. Real paid orders only, in India time.`}
    actions={<a className="btn btn-ghost" href={`/api/admin/export?${new URLSearchParams({ from: range.from, to: range.to })}`}>Export CSV <span aria-hidden>&darr;</span></a>}>
    <div className="mb-6 grid gap-3">
      <nav className="flex flex-wrap gap-2" aria-label="Date range presets">
        {PRESET_LINKS.map(([v, label]) => <Link key={v} href={href({ range: v })} aria-current={range.preset === v ? "true" : undefined} className="chip">{label}</Link>)}
        <Link href={href(keep, !range.compare)} className="chip sm:ml-auto" aria-pressed={range.compare}>{range.compare ? "✓ " : ""}Compare to previous period</Link>
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Custom date range">
        {!range.compare && <input type="hidden" name="compare" value="0" />}
        <label className="text-sm">From<input type="date" name="from" defaultValue={range.from} max={todayIndia()} required className="field-input mt-1 !min-h-10" /></label>
        <label className="text-sm">To<input type="date" name="to" defaultValue={range.to} max={todayIndia()} required className="field-input mt-1 !min-h-10" /></label>
        <button className="btn btn-ghost !min-h-10" type="submit">Apply custom range</button>
        {range.clamped && <p className="basis-full text-sm text-ink-soft">Ranges are limited to {MAX_DAYS} days, so the start date was moved to {range.from}.</p>}
        {range.compare && a.previous && <p className="basis-full text-sm text-ink-soft">Compared with {dayLabel(a.previous.from)} to {dayLabel(a.previous.to)} ({a.previous.days} {a.previous.days === 1 ? "day" : "days"} before).</p>}
      </form>
    </div>

    {noOrders && <div className="mb-6 rounded-xl border border-line bg-white p-6 text-center" role="status"><p className="font-medium">No orders in this range</p>
      <p className="mt-1 text-sm text-ink-soft">Pick a longer range above, or see <Link className="underline" href="/admin/orders">all orders</Link>.</p></div>}

    <div className="mb-6 grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" data-testid="kpis">
      {cards(a).map((c) => <KpiCard key={c.label} c={c} compare={range.compare} />)}
    </div>

    <div className="grid gap-5">
      <Panel title="Revenue and orders over time" note={a.weekly ? "Weekly totals, Monday to Sunday." : "Daily totals."}>
        <Show s={a.sales}>{(d) => <Chart kind="bar" ariaLabel="Revenue and orders over time" height={320}
          labels={d.buckets.map(fmtBucket)}
          series={[{ label: "Revenue", data: d.buckets.map((b) => b.revenue), format: "money", as: "bar" },
            ...(range.compare && d.previousBuckets.length ? [{ label: "Revenue, previous period", data: d.buckets.map((_, i) => d.previousBuckets[i]?.revenue ?? 0), format: "money" as const, as: "line" as const, dashed: true, colour: "#7a7a88" }] : []),
            { label: "Orders", data: d.buckets.map((b) => b.orders), format: "count", as: "line", axis: "right", colour: "#299637" }]} />}</Show>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Top products" note="By revenue. Share is of all product revenue in the range.">
          <Show s={a.products}>{(rows) => rows.length ? <>
            <Chart kind="bar" horizontal legend={false} ariaLabel="Top products by revenue" height={Math.max(180, rows.length * 34)} labels={rows.map((r) => r.title.length > 28 ? `${r.title.slice(0, 27)}…` : r.title)} series={[{ label: "Revenue", data: rows.map((r) => r.revenue), format: "money" }]} />
            <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-ink-soft"><th className="py-1 pr-2 font-medium">{WORDS.itemTitle}</th><th className="px-2 font-medium">Units</th><th className="px-2 text-right font-medium">Revenue</th><th className="pl-2 text-right font-medium">Share</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.slug} className="border-t border-line"><td className="py-2 pr-2"><Link className="underline" href={`${WORDS.editBase}/${encodeURIComponent(r.slug)}`}>{r.title}</Link></td><td className="px-2">{n(r.units)}</td><td className="px-2 text-right font-medium">{rupees(r.revenue)}</td><td className="pl-2 text-right">{r.share.toFixed(1)}%</td></tr>)}</tbody></table></div></>
            : <Empty>No sales in this range.</Empty>}</Show>
        </Panel>
        <Panel title="Revenue by category">
          <Show s={a.categories}>{(rows) => rows.length ? <Chart kind="doughnut" ariaLabel="Revenue by category" height={300} labels={rows.map((r) => r.name)} series={[{ label: "Revenue", data: rows.map((r) => r.revenue), format: "money" }]} /> : <Empty>No sales in this range.</Empty>}</Show>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Sales by day of week" note="Paid orders, India time. Darker bars are busier.">
          <Show s={a.timing}>{(t) => t.weekday.some((w) => w.orders) ? <Chart kind="bar" heat legend={false} ariaLabel="Paid orders by day of week" height={240} labels={weekdays} series={[{ label: "Orders", data: t.weekday.map((w) => w.orders) }]} /> : <Empty>No paid orders in this range.</Empty>}</Show>
        </Panel>
        <Panel title="Sales by hour of day" note="Paid orders, India time.">
          <Show s={a.timing}>{(t) => t.hour.some((w) => w.orders) ? <Chart kind="bar" heat legend={false} ariaLabel="Paid orders by hour of day" height={240} labels={t.hour.map((_, h) => hourLabel(h))} series={[{ label: "Orders", data: t.hour.map((w) => w.orders) }]} /> : <Empty>No paid orders in this range.</Empty>}</Show>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Payment outcomes" note="Orders started in this range, by where they ended up.">
          <Show s={a.sales}>{(d) => { const c = d.current; const rows = [["Paid", c.paid], ["Failed", c.failed], ["Unfinished", c.pending], ["Refunded", c.refundedStatus]] as const;
            return c.started ? <Chart kind="doughnut" ariaLabel="Payment outcomes" height={240} labels={rows.map((r) => r[0])} series={[{ label: "Orders", data: rows.map((r) => r[1]) }]} /> : <Empty>No orders started in this range.</Empty>; }}</Show>
          <div className="mt-4 border-t border-line pt-4 text-sm"><p className="font-medium">Delivery recovery queue</p>
            <Show s={a.recovery}>{(r) => <p className="mt-1 text-ink-soft" data-testid="recovery">{r.awaiting + r.email + r.payments === 0 ? "Nothing needs attention right now."
              : `${r.awaiting} paid but not delivered, ${r.email} emails waiting, ${r.payments} payments to reconcile.`} <Link className="underline" href="/admin/platform/delivery">Open delivery recovery</Link></p>}</Show></div>
        </Panel>
        <Panel title="Customers" note="Paying customers per week. New means their first paid order ever.">
          <Show s={a.customers}>{(c) => c.weeks.length ? <Chart kind="bar" stacked ariaLabel="New and returning customers per week" height={260} labels={c.weeks.map((w) => `Week of ${dayLabel(w.week)}`)}
            series={[{ label: "New", data: c.weeks.map((w) => w.fresh), stack: "c" }, { label: "Returning", data: c.weeks.map((w) => w.returning), stack: "c", colour: "#299637" }]} /> : <Empty>No paying customers in this range.</Empty>}</Show>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Offers" note="Offers used on paid orders in this range.">
          <Show s={a.offers}>{(o) => o.rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-ink-soft"><th className="py-1 pr-2 font-medium">Offer</th><th className="px-2 font-medium">Uses</th><th className="px-2 font-medium">Discount given</th><th className="pl-2 text-right font-medium">Order revenue</th></tr></thead>
            <tbody>{o.rows.map((r) => <tr key={r.id} className="border-t border-line"><td className="py-2 pr-2">{r.name}</td><td className="px-2">{n(r.uses)}</td><td className="px-2">{rupees(r.given)}</td><td className="pl-2 text-right font-medium">{rupees(r.revenue)}</td></tr>)}</tbody></table></div>
            : <Empty>No offers used in this range. <Link className="underline" href="/admin/offers">Manage offers</Link></Empty>}</Show>
        </Panel>
        <Panel title={`${WORDS.itemsTitle} with no sales`} note={`Live ${WORDS.items} nobody bought in this range.`}>
          <Show s={a.lowSellers}>{(l) => l.rows.length ? <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><tbody>{l.rows.map((r) => <tr key={r.slug} className="border-t border-line first:border-0"><td className="py-2 pr-2"><Link className="underline" href={`${WORDS.editBase}/${encodeURIComponent(r.slug)}`}>{r.title}</Link></td><td className="text-right">{rupees(r.price)}</td></tr>)}</tbody></table></div>
            {l.total > l.rows.length && <p className="mt-2 text-sm text-ink-soft">Showing {l.rows.length} of {n(l.total)}. <Link className="underline" href={WORDS.editBase}>See all {WORDS.items}</Link></p>}</>
            : <Empty>Every live {WORDS.item} sold at least once.</Empty>}</Show>
        </Panel>
      </div>

      <Panel title="Recent orders" note="Latest orders started in this range, any status.">
        <Show s={a.recent}>{(rows) => rows.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="text-ink-soft">{["Order", "Customer", "Total", "Status", "Placed"].map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map((o) => <tr key={o.id} className="border-t border-line"><td className="py-2 pr-3"><Link className="underline" href={`/admin/orders/${encodeURIComponent(o.id)}`}>{o.id.slice(0, 10)}…</Link></td>
            <td className="pr-3">{o.name || "—"}<br /><span className="text-ink-soft">{o.email}</span></td><td className="pr-3">{rupees(o.total)}</td><td className="pr-3">{o.status.replace("_", " ")}</td><td>{o.at}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-sm"><Link className="underline" href={`/admin/orders?from=${range.from}&to=${range.to}`}>See every order in this range</Link></p></>
          : <Empty>No orders in this range.</Empty>}</Show>
      </Panel>
    </div>
    <p className="mt-6 text-xs text-ink-soft">Loaded with {a.queries} database queries.{s ? ` ${n(s.current.started)} orders started in this range, ${n(s.current.orders)} paid.` : ""}</p>
  </AdminShell>;
}
