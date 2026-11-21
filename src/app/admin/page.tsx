import { sql } from "@/lib/db";
import { rupees } from "@/lib/money";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import AdminShell from "@/components/AdminShell";
import Chart from "@/components/admin/Chart";
import StatCard from "@/components/admin/StatCard";
import { checkoutProblems, deploymentInfo } from "@/lib/razorpay";
import { demoCount } from "@/lib/demo-store";
import { getAdminContent } from "@/lib/content";
import { mergeSections, sectionKeyOf } from "@/lib/banner-sections";
import { bannerState } from "./banners/banner-state";
import type { AdminBanner } from "./banners/BannerForm";
import { Activity, CircleAlert, Download, Mail, Repeat, ShoppingBag, Wallet, Image, Users } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

// IST calendar day of an instant, as YYYY-MM-DD.
const istDay = (iso: string | number | Date) => new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 10);

export default async function Admin({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { demo } = await searchParams;
  const demoBooks = await demoCount().catch(() => 0);

  // One round of parallel queries instead of six in a row: each query to the database costs a network round trip.
  const [ordersRows, totalsRows, convRows, downloadRows, eventRows, healthRows, modules] = await Promise.all([
    sql`select id, name, email, phone, total, status, created_at, items from orders order by created_at desc limit 100`,
    sql`select coalesce(sum(total),0)::int as revenue, count(*)::int as units from orders where status in ('paid','fulfilled')`,
    sql`select count(*)::int as started from orders`,
    sql`select book_slug, sum(count)::int as total_downloads, count(*)::int as active_orders from downloads group by book_slug order by total_downloads desc`,
    sql`select id, order_id, type, payload, created_at from events order by created_at desc limit 40`,
    sql`select
    (select count(*)::int from orders where status='paid') incomplete,
    (select count(*)::int from email_delivery where state in ('pending','sending','manual')) email_pending,
    (select count(*)::int from payment_attempts where state in ('creating','unknown')) reconciliation,
    (select count(*)::int from events where type='download.failed' and created_at>now()-interval '1 day') download_errors`,
    getAdminContent("modules").catch(() => []),
  ]);
  const orders = ordersRows as { id: string; name: string | null; email: string; phone: string | null; total: number; status: string; created_at: string; items: { title: string }[] }[];
  const [totals] = totalsRows as { revenue: number; units: number }[];
  const [conv] = convRows as { started: number }[];
  const downloadStats = downloadRows as { book_slug: string; total_downloads: number; active_orders: number }[];
  const recentEvents = eventRows as { id: number; order_id: string | null; type: string; payload: Record<string, unknown>; created_at: string }[];
  const [health] = healthRows as Record<string, number>[];
  const rate = conv.started ? Math.round((totals.units / conv.started) * 100) : 0;
  const allDownloads = downloadStats.reduce((a, d) => a + d.total_downloads, 0);
  const checkoutIssues = checkoutProblems();
  const deploy = deploymentInfo();

  // Last 14 IST days, from the latest 100 orders (the list this page already loads).
  const today = istDay(Date.now());
  const days = Array.from({ length: 14 }, (_, i) => istDay(Date.parse(`${today}T00:00:00Z`) - (13 - i) * 86400000 + 12 * 3600000));
  const paid = (o: { status: string }) => o.status === "paid" || o.status === "fulfilled";
  const revenueByDay = days.map((d) => orders.filter((o) => paid(o) && istDay(o.created_at) === d).reduce((a, o) => a + o.total, 0));
  const ordersByDay = days.map((d) => orders.filter((o) => istDay(o.created_at) === d).length);

  // Banners: live count per section, from the same rules the storefront uses.
  const banners = (modules as (AdminBanner & { type: string })[]).filter((m) => m.type === "banner");
  const sections = mergeSections(modules as never);
  const now = Date.now();
  const liveBanners = banners.filter((b) => bannerState(b, now).live).length;

  return (
    <AdminShell
      active="overview"
      title="Dashboard"
      subtitle={`Sales, downloads and the audit trail. Last updated ${new Date(now).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST.`}
      actions={<>
        <a className="btn" href="/api/admin/export">Export CSV <span aria-hidden="true">&darr;</span></a>
        <a className="btn btn-primary" href="/admin/products">Products</a>
      </>}
    >
      <section className="am-card mb-5" style={{ padding: "16px 18px", borderColor: checkoutIssues.length ? "#fecaca" : "#bfdbfe", background: checkoutIssues.length ? "#fef2f2" : "#eff6ff" }} aria-labelledby="checkout-status">
        <div className="flex items-start gap-3">
          <CircleAlert size={18} aria-hidden="true" style={{ color: checkoutIssues.length ? "var(--danger)" : "var(--brand)", marginTop: 2 }} />
          <div className="min-w-0">
            <h2 id="checkout-status" className="text-[15px] font-semibold">{checkoutIssues.length ? "Checkout is off: customers see \"Online ordering is currently unavailable\"" : "Checkout is on"}</h2>
            {checkoutIssues.length > 0 && <>
              <p className="mt-1 text-sm text-ink-soft">Fix these in Vercel, then Settings, then Environment Variables (Production), and redeploy:</p>
              <ul className="mt-2 grid gap-1 font-mono text-[13px]">{checkoutIssues.map((issue) => <li key={issue}>• {issue}</li>)}</ul>
              <p className="mt-3 text-xs text-ink-soft">&quot;Not set in this deployment&quot; means this site never received the variable: check it is ticked for Production, is in this Vercel project, and the name matches exactly. Then redeploy.</p>
            </>}
            <p className="mt-2 text-xs text-ink-mute">Checked by: {deploy.environment ? `${deploy.environment} deployment` : "a local run"}{deploy.branch ? ` · branch ${deploy.branch}` : ""}{deploy.commit ? ` · commit ${deploy.commit}` : ""}</p>
          </div>
        </div>
      </section>

      <div className="am-stats mb-5">
        <StatCard icon={<Wallet size={18} aria-hidden="true" />} label="Revenue" value={rupees(totals.revenue)} hint="paid and fulfilled orders" />
        <StatCard icon={<ShoppingBag size={18} aria-hidden="true" />} label="Paid orders" value={totals.units} hint={`${conv.started} started`} />
        <StatCard icon={<Repeat size={18} aria-hidden="true" />} label="Conversion" value={`${rate}%`} hint="paid of started" />
        <StatCard icon={<Download size={18} aria-hidden="true" />} label="Downloads" value={allDownloads} hint={`${downloadStats.length} ${downloadStats.length === 1 ? "product" : "products"}`} />
      </div>

      <div className="am-grid mb-5">
        <section className="am-card" aria-labelledby="trend-title">
          <div className="am-card-head">
            <h2 id="trend-title" className="am-card-title">Sales, last 14 days</h2>
            <span className="text-xs text-ink-mute">Latest 100 orders</span>
          </div>
          <div className="am-card-body">
            <Chart kind="combo" ariaLabel="Revenue and orders for the last 14 days" height={260} labels={days.map((d) => d.slice(5))}
              series={[
                { label: "Revenue", data: revenueByDay, format: "money", as: "line", axis: "right" },
                { label: "Orders", data: ordersByDay, format: "count", as: "bar", axis: "left" },
              ]} />
          </div>
        </section>

        <section className="am-card" aria-labelledby="activity-title">
          <div className="am-card-head">
            <h2 id="activity-title" className="am-card-title">Recent activity</h2>
            <a href="/admin/orders" className="text-xs font-medium" style={{ color: "var(--brand)" }}>All orders</a>
          </div>
          <div className="am-card-body">
            {recentEvents.length === 0 && <p className="text-ink-soft">No events yet.</p>}
            <ul className="am-activity">
              {recentEvents.slice(0, 6).map((ev) => {
                const Icon = ev.type.includes("fail") ? CircleAlert : ev.type.includes("download") ? Download : ev.type.includes("email") ? Mail : ev.type.includes("order") || ev.type.includes("payment") ? ShoppingBag : Activity;
                return <li key={ev.id}>
                  <span className="am-activity-icon" aria-hidden="true"><Icon size={15} /></span>
                  <div className="min-w-0">
                    <p className="am-activity-title truncate">{String(ev.type).replace(/^admin\.book\./, "admin.product.").replace(/^book\./, "product.").replace(/[._]/g, " ")}</p>
                    <p className="am-activity-sub">{new Date(ev.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{ev.order_id ? <> · <a href={"/admin/orders/" + encodeURIComponent(ev.order_id)} className="underline">{ev.order_id.slice(0, 10)}</a></> : null}</p>
                  </div>
                </li>;
              })}
            </ul>
          </div>
        </section>
      </div>

      <div className="am-grid-even mb-5">
        <section className="am-card" aria-labelledby="health-title">
          <div className="am-card-head"><h2 id="health-title" className="am-card-title">Delivery health</h2><a href="/admin/platform/delivery" className="text-xs font-medium" style={{ color: "var(--brand)" }}>Review delivery recovery</a></div>
          <div className="am-card-body">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[["Incomplete paid orders", health.incomplete], ["Pending email", health.email_pending], ["Payment reconciliation", health.reconciliation], ["Download errors today", health.download_errors]].map(([label, n]) => (
                <div key={label as string}><dt className="text-xs text-ink-mute">{label}</dt><dd className="mt-0.5 flex items-center gap-2 text-lg font-semibold tabular-nums"><span className={`am-pill ${Number(n) ? "bad" : "good"}`}>{Number(n) ? "Needs attention" : "OK"}</span>{n}</dd></div>
              ))}
            </dl>
          </div>
        </section>

        <section className="am-card" aria-labelledby="banner-title">
          <div className="am-card-head"><h2 id="banner-title" className="am-card-title">Banners and sections</h2><a href="/admin/banners" className="text-xs font-medium" style={{ color: "var(--brand)" }}>Manage banners</a></div>
          <div className="am-card-body">
            <p className="mb-3 text-sm text-ink-soft"><Image size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /> {liveBanners} live {liveBanners === 1 ? "banner" : "banners"} across {sections.filter((s) => s.enabled).length} sections.</p>
            <ul className="grid gap-2">
              {sections.filter((s) => s.enabled).slice(0, 6).map((s) => {
                const n = banners.filter((b) => sectionKeyOf(b.payload?.placement) === s.key && bannerState(b, now).live).length;
                return <li key={s.key} className="flex items-center justify-between gap-3 border-t border-line pt-2 text-sm first:border-t-0 first:pt-0">
                  <span>{s.name}</span><span className={`am-pill ${n ? "good" : ""}`}>{n ? `${n} live` : "empty"}</span>
                </li>;
              })}
            </ul>
          </div>
        </section>

        <section className="am-card" aria-labelledby="demo-status">
          <div className="am-card-head"><h2 id="demo-status" className="am-card-title">Demo catalogue {demoBooks > 0 ? `· ${demoBooks} preview add-ons` : "· off"}</h2></div>
          <div className="am-card-body">
            <p className="mb-3 text-sm text-ink-soft">{demo === "failed" ? "That did not work. Try again." : "Sample add-ons, categories and banners to preview the full store. They show prices but can't be bought."}</p>
            <form action="/api/admin/demo" method="post"><input type="hidden" name="action" value={demoBooks > 0 ? "remove" : "load"} />
              <button className={demoBooks > 0 ? "btn" : "btn btn-primary"} type="submit">{demoBooks > 0 ? "Remove demo catalogue" : "Load demo catalogue"}</button></form>
          </div>
        </section>
      </div>

      <section className="am-card mb-5" aria-labelledby="orders-title">
        <div className="am-card-head"><h2 id="orders-title" className="am-card-title">Recent orders</h2><a href="/admin/orders" className="text-xs font-medium" style={{ color: "var(--brand)" }}>View all</a></div>
        <div className="am-table-wrap">
          <table>
            <caption className="sr-only">Recent orders</caption>
            <thead><tr>{["Order", "Customer", "Contact", "Add-on", "Total", "Status", "When"].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {orders.slice(0, 15).map((o) => (
                <tr key={o.id}>
                  <td><a className="font-mono underline" href={"/admin/orders/" + encodeURIComponent(o.id)}>{o.id.slice(0, 10)}</a></td>
                  <td>{o.name ?? "—"}</td>
                  <td className="text-ink-soft">{o.email}{o.phone && <><br /><span className="font-mono text-xs">{o.phone}</span></>}</td>
                  <td className="max-w-[220px] truncate">{o.items?.[0]?.title ?? "—"}</td>
                  <td className="font-mono whitespace-nowrap tabular-nums">{rupees(o.total)}</td>
                  <td><span className={`am-pill ${paid(o) ? "good" : o.status === "payment_failed" ? "bad" : "neutral"}`}>{o.status.replace(/_/g, " ")}</span></td>
                  <td className="text-ink-soft whitespace-nowrap">{new Date(o.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="p-6 text-ink-soft">No orders yet.</p>}
        </div>
      </section>

      <div className="am-grid-even">
        <section className="am-card" aria-labelledby="products-title">
          <div className="am-card-head"><h2 id="products-title" className="am-card-title">Downloads per product</h2></div>
          <div className="am-table-wrap">
            <table>
              <thead><tr><th scope="col">Product</th><th scope="col" className="text-right">Downloads</th><th scope="col" className="text-right">Orders</th></tr></thead>
              <tbody>
                {downloadStats.slice(0, 12).map((d) => (
                  <tr key={d.book_slug}><td className="truncate max-w-[280px]">{d.book_slug.replace(/-/g, " ")}</td><td className="text-right tabular-nums">{d.total_downloads}</td><td className="text-right tabular-nums">{d.active_orders}</td></tr>
                ))}
              </tbody>
            </table>
            {downloadStats.length === 0 && <p className="p-6 text-ink-soft">No downloads yet.</p>}
          </div>
        </section>

        <section className="am-card" aria-labelledby="audit-title">
          <div className="am-card-head"><h2 id="audit-title" className="am-card-title">Audit trail</h2></div>
          <div className="am-table-wrap">
            <table className="text-xs">
              <thead><tr><th scope="col">Time</th><th scope="col">Type</th><th scope="col">Order</th></tr></thead>
              <tbody>
                {recentEvents.slice(0, 12).map((ev) => (
                  <tr key={ev.id}>
                    <td className="whitespace-nowrap text-ink-soft">{new Date(ev.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                    <td className="font-medium">{String(ev.type).replace(/^admin\.book\./, "admin.product.").replace(/^book\./, "product.")}</td>
                    <td>{ev.order_id ? <a href={"/admin/orders/" + encodeURIComponent(ev.order_id)} className="underline">{ev.order_id.slice(0, 10)}</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentEvents.length === 0 && <p className="p-6 text-ink-soft">No events yet.</p>}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
