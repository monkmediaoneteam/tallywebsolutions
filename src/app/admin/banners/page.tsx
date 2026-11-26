import { redirect } from "next/navigation";
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import { getAdminContent } from "@/lib/content";
import AdminShell from "@/components/AdminShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { LAYOUTS, mergeSections, ratio, sectionKeyOf, toIndiaInput } from "@/lib/banner-sections";
import type { AdminBanner } from "./BannerForm";
import { TONE, bannerState } from "./banner-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Banners", robots: { index: false, follow: false } };

const icon = "grid h-8 w-8 place-items-center rounded-1 text-ink-soft hover:bg-bg-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

export default async function BannersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; q?: string; section?: string }> }) {
  const { saved, error, q = "", section: only = "" } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  const modules = await getAdminContent("modules") as unknown as (AdminBanner & { type: string })[];
  const sections = mergeSections(modules);
  const bySection = new Map(sections.map((s) => [s.key, s]));
  const all = modules.filter((m) => m.type === "banner").map((b) => ({ b, key: sectionKeyOf(b.payload?.placement) }));
  const needle = q.trim().toLowerCase().slice(0, 100);
  const filter = bySection.has(only) ? only : "";
  // Table order follows the page: section by section, each in its admin-set order.
  const order = (key: string) => { const i = sections.findIndex((s) => s.key === key); return i < 0 ? 999 : i; };
  const rows = all.filter(({ b, key }) => (!filter || key === filter) && (!needle || b.title.toLowerCase().includes(needle)))
    .sort((a, b) => order(a.key) - order(b.key) || a.b.sort - b.b.sort || a.b.id.localeCompare(b.b.id));
  const now = Date.now();
  const live = all.filter(({ b }) => bannerState(b, now).live).length;
  const href = (key: string) => `/admin/banners${key || q ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(key ? { section: key } : {}) })}` : ""}`;

  return <AdminShell active="banners" title="Banners" subtitle={`${all.length} banner${all.length === 1 ? "" : "s"} · ${live} live · ${sections.filter((s) => s.enabled).length} sections on`}
    actions={<div className="flex flex-wrap gap-2">
      <a className="btn btn-ghost" href="/admin/banners/sections"><Layers size={16} aria-hidden="true" />Sections and layout</a>
      <a className="btn btn-primary" href={`/admin/banners/new${filter ? `?section=${filter}` : ""}`}><Plus size={16} aria-hidden="true" />Add banner</a>
    </div>}>
    {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The site is updated.</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error}</p>}

    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <form method="get" className="flex min-w-0 flex-1 items-center gap-2" role="search">
          {filter && <input type="hidden" name="section" value={filter} />}
          <label className="sr-only" htmlFor="banner-search">Search banners</label>
          <div className="relative min-w-0 max-w-sm flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
            <input id="banner-search" name="q" defaultValue={q} placeholder="Search banner name" className="field-input w-full pl-9" />
          </div>
          <button className="btn btn-ghost" type="submit">Search</button>
          {(q || filter) && <a className="text-sm text-ink-soft underline" href="/admin/banners">Reset</a>}
        </form>
        <nav aria-label="Filter by section" className="flex flex-wrap gap-1">
          {[{ key: "", name: "All", n: all.length }, ...sections.map((s) => ({ key: s.key, name: s.name, n: all.filter((x) => x.key === s.key).length }))].map(({ key, name, n }) =>
            <a key={key || "all"} href={href(key)} aria-current={filter === key ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${filter === key ? "border-brand bg-brand text-white" : "border-line text-ink-soft hover:bg-bg-3 hover:text-ink"}`}>
              {name} <span className="tabular-nums opacity-70">{n}</span></a>)}
        </nav>
      </div>

      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
        <thead className="bg-bg-2"><tr className="text-left text-ink-soft">
          <th scope="col" className="p-3 font-medium">Banner</th>
          <th scope="col" className="p-3 font-medium">Section</th>
          <th scope="col" className="p-3 font-medium">Status</th>
          <th scope="col" className="p-3 font-medium">Schedule</th>
          <th scope="col" className="p-3 text-right font-medium">Order</th>
          <th scope="col" className="p-3 text-right font-medium">Actions</th>
        </tr></thead>
        <tbody>{rows.map(({ b, key }) => {
          const section = bySection.get(key);
          const state = bannerState(b, now);
          const mates = all.filter((x) => x.key === key).sort((x, y) => x.b.sort - y.b.sort || x.b.id.localeCompare(y.b.id)).map((x) => x.b.id);
          const pos = mates.indexOf(b.id);
          const liveMates = all.filter((x) => x.key === key && bannerState(x.b, now).live).sort((x, y) => x.b.sort - y.b.sort || x.b.id.localeCompare(y.b.id)).map((x) => x.b.id);
          const waiting = state.live && section && liveMates.indexOf(b.id) >= section.max;
          const edit = `/admin/banners/${encodeURIComponent(b.id)}`;
          return <tr key={b.id} className="border-t border-line hover:bg-bg-2">
            <td className="p-3"><div className="flex items-center gap-3">
              <a href={edit} className="block w-36 shrink-0 overflow-hidden rounded-1 border border-line bg-bg-2" style={{ aspectRatio: section ? ratio(section.width, section.height) : "16 / 7" }} aria-label={`Edit ${b.title}`}>
                {b.image_url ? <img src={b.image_url} alt="" className="h-full w-full" style={{ objectFit: section?.fit === "contain" || section?.fit === "adapt" ? "contain" : "cover" }} /> : <span className="grid h-full w-full place-items-center text-[11px] text-ink-soft">No image</span>}</a>
              <div className="min-w-0"><a href={edit} className="font-medium hover:underline">{b.title}</a>
                <p className="truncate text-xs text-ink-soft">{b.link_url ? `Links to ${b.link_url}` : "Not linked"}{b.mobile_image_url ? " · phone image" : ""}</p></div>
            </div></td>
            <td className="p-3">{section ? <><a className="hover:underline" href={href(key)}>{section.name}</a>
              <p className="text-xs text-ink-soft">{LAYOUTS[section.layout].split(":")[0]}{section.enabled ? "" : " · section off"}</p></>
              : <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger">Section deleted</span>}</td>
            <td className="p-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[state.tone]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{state.label}</span>
              {waiting && <p className="mt-1 text-xs text-ink-soft">Not showing: section shows {section!.max}</p>}
              {state.live && section && !section.enabled && <p className="mt-1 text-xs text-ink-soft">Section is off</p>}</td>
            <td className="p-3 text-xs text-ink-soft">{b.publish_at || b.ends_at ? <>{b.publish_at ? <>from {toIndiaInput(b.publish_at).replace("T", " ")}</> : null}{b.publish_at && b.ends_at ? <br /> : null}{b.ends_at ? <>until {toIndiaInput(b.ends_at).replace("T", " ")}</> : null}</> : "Always"}</td>
            <td className="p-3"><div className="flex justify-end gap-1">
              {(["up", "down"] as const).map((direction) => <form key={direction} action="/api/admin/platform/content" method="post">
                <input type="hidden" name="section" value="modules" /><input type="hidden" name="id" value={b.id} /><input type="hidden" name="action" value="move" />
                <input type="hidden" name="direction" value={direction} /><input type="hidden" name="return_to" value="/admin/banners" />
                <button type="submit" className={icon} aria-label={`Move ${b.title} ${direction}`} disabled={direction === "up" ? pos <= 0 : pos >= mates.length - 1}>
                  {direction === "up" ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />}</button></form>)}
            </div></td>
            <td className="p-3"><div className="flex justify-end gap-1">
              <a href={edit} className={icon} title="Edit" aria-label={`Edit ${b.title}`}><Pencil size={16} aria-hidden="true" /></a>
              <form action="/api/admin/platform/content" method="post">
                <input type="hidden" name="section" value="modules" /><input type="hidden" name="id" value={b.id} /><input type="hidden" name="updated_at" value={b.updated_at} />
                <input type="hidden" name="return_to" value="/admin/banners" />
                <ConfirmSubmit name="action" value="delete" className={`${icon} !text-danger hover:!bg-danger/10`} title="Delete" aria-label={`Delete ${b.title}`}
                  message={`Delete the banner "${b.title}"? This cannot be undone.`}><Trash2 size={16} aria-hidden="true" /></ConfirmSubmit>
              </form>
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>
        : <p className="p-8 text-center text-sm text-ink-soft">{all.length ? "No banners match this search." : "No banners yet. Use Add banner to create the first one."}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-soft">
        <span>Showing {rows.length} of {all.length}</span>
        <span>Where banners show, their layout, count and image size are set under <a className="underline" href="/admin/banners/sections">Sections and layout</a>.</span>
      </div>
    </div>
  </AdminShell>;
}
