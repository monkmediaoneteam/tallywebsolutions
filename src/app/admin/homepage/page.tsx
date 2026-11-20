import { redirect } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, ExternalLink, Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import { readSiteSetting } from "@/lib/site-settings";
import AdminShell from "@/components/AdminShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { HOME_SLOT_POSITIONS, MAX_SECTIONS, SECTION_TYPES, cleanLayout, defaultLayout, resolveSection, typeOf } from "@/lib/home-sections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Homepage sections", robots: { index: false, follow: false } };

const icon = "grid h-8 w-8 place-items-center rounded-1 text-ink-soft hover:bg-bg-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
const ACTION = "/api/admin/homepage";

function Hidden({ id, action, extra }: { id?: string; action: string; extra?: Record<string, string> }) {
  return <>{id && <input type="hidden" name="id" value={id} />}<input type="hidden" name="action" value={action} />
    {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>;
}

export default async function HomepageSections({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  const stored = await readSiteSetting("home_layout");
  const layout = stored.value ? cleanLayout(stored.value, false) : defaultLayout();
  const sections = (layout.sections.length ? layout : defaultLayout()).sections;
  const rows = sections.map((s) => ({ s, t: typeOf(s.type)!, r: resolveSection(s) }));
  const customised = !!stored.value;
  const usedSlots = new Set(sections.filter((s) => s.type === "banner-slot").map((s) => s.settings.position));
  const freeSlots = HOME_SLOT_POSITIONS.filter(([k]) => !usedSlots.has(k));
  const present = new Set(sections.map((s) => s.type));
  const groups = (["Store sections", "Banners", "Content"] as const).map((category) => ({ category, types: SECTION_TYPES.filter((t) => t.category === category) }));

  return <AdminShell active="homepage" title="Homepage sections" subtitle={`${sections.length} section${sections.length === 1 ? "" : "s"} · ${sections.filter((s) => s.enabled).length} showing · top to bottom, as on the storefront`}
    actions={<div className="flex flex-wrap gap-2">
      <a className="btn btn-ghost" href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />Open storefront</a>
      <details className="relative">
        <summary className="btn btn-primary cursor-pointer list-none"><Plus size={16} aria-hidden="true" />Add section</summary>
        <div className="absolute right-0 z-20 mt-2 w-[min(92vw,420px)] rounded-xl border border-line bg-white p-3 shadow-lg">
          {groups.map(({ category, types }) => <div key={category} className="mb-2 last:mb-0">
            <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{category}</p>
            <ul className="grid gap-1">{types.flatMap((t) => {
              if (t.id === "banner-slot") return freeSlots.length ? freeSlots.map(([k, label]) => ({ t, k, label })) : [{ t, k: "", label: "" }];
              return [{ t, k: "", label: "" }];
            }).map(({ t, k, label }) => {
              const disabled = (t.singleton && present.has(t.id)) || (t.id === "banner-slot" && !k) || sections.length >= MAX_SECTIONS;
              return <li key={`${t.id}${k}`}><form action={ACTION} method="post"><Hidden action="add" extra={{ type: t.id, ...(k ? { position: k } : {}) }} />
                <button type="submit" disabled={disabled} className="block w-full rounded-2 px-2 py-2 text-left hover:bg-bg-2 disabled:cursor-not-allowed disabled:opacity-45">
                  <span className="block text-sm font-medium">{t.label}{k ? `: ${label.replace("Homepage, ", "")}` : ""}</span>
                  <span className="block text-xs text-ink-soft">{disabled && t.singleton ? "Already on the page." : disabled && t.id === "banner-slot" ? "Every position has a slot." : t.description}</span>
                </button></form></li>;
            })}</ul></div>)}
        </div>
      </details>
    </div>}>
    {stored.missing && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert">Changes cannot be saved yet: apply the database migration <code>013-site-settings.sql</code>. The page shows the default layout until then.</p>}
    {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The storefront is updated.</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error}</p>}

    <div className="overflow-hidden rounded-xl border border-line bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
      <thead className="bg-bg-2"><tr className="text-left text-ink-soft">
        <th scope="col" className="w-10 p-3 font-medium">#</th><th scope="col" className="p-3 font-medium">Section</th><th scope="col" className="p-3 font-medium">Type</th>
        <th scope="col" className="p-3 font-medium">Shown</th><th scope="col" className="p-3 text-right font-medium">Order</th><th scope="col" className="p-3 text-right font-medium">Actions</th>
      </tr></thead>
      <tbody>{rows.map(({ s, t, r }, i) => {
        const name = (r.settings.heading as string) || t.label;
        const edit = `/admin/homepage/${encodeURIComponent(s.id)}`;
        const summary = t.summary ? t.summary(r.settings, r.blocks) : t.description;
        return <tr key={s.id} data-section-id={s.id} className={`border-t border-line hover:bg-bg-2 ${s.enabled ? "" : "opacity-60"}`}>
          <td className="p-3 tabular-nums text-ink-soft">{i + 1}</td>
          <td className="p-3"><a href={edit} className="font-medium hover:underline">{name}</a><p className="max-w-md truncate text-xs text-ink-soft">{summary}</p></td>
          <td className="p-3 text-ink-soft">{t.label}</td>
          <td className="p-3"><form action={ACTION} method="post"><Hidden id={s.id} action="toggle" />
            <button type="submit" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.enabled ? "bg-brand/10 text-brand" : "bg-bg-3 text-ink-soft"}`}
              aria-label={`${s.enabled ? "Hide" : "Show"} ${name}`} title={s.enabled ? "Showing: click to hide" : "Hidden: click to show"}>
              {s.enabled ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}{s.enabled ? "Showing" : "Hidden"}</button></form></td>
          <td className="p-3"><div className="flex justify-end gap-1">
            {(["up", "down"] as const).map((d) => <form key={d} action={ACTION} method="post"><Hidden id={s.id} action="move" extra={{ direction: d }} />
              <button type="submit" className={icon} aria-label={`Move ${name} ${d}`} disabled={d === "up" ? i === 0 : i === rows.length - 1}>
                {d === "up" ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />}</button></form>)}
          </div></td>
          <td className="p-3"><div className="flex justify-end gap-1">
            <a href={edit} className={icon} title="Edit" aria-label={`Edit ${name}`}><Pencil size={16} aria-hidden="true" /></a>
            {!t.singleton && <form action={ACTION} method="post"><Hidden id={s.id} action="duplicate" />
              <button type="submit" className={icon} title="Duplicate" aria-label={`Duplicate ${name}`}><Copy size={16} aria-hidden="true" /></button></form>}
            {t.removable && <form action={ACTION} method="post"><Hidden id={s.id} action="delete" />
              <ConfirmSubmit className={`${icon} !text-danger hover:!bg-danger/10`} title="Delete" aria-label={`Delete ${name}`}
                message={`Delete the section "${name}"? This cannot be undone.`}><Trash2 size={16} aria-hidden="true" /></ConfirmSubmit></form>}
          </div></td>
        </tr>;
      })}</tbody>
    </table></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-soft">
      <span>Banners inside the top area and the banner slots are chosen under <a className="underline" href="/admin/banners/sections">Banners</a>. Colours and width for the whole site are under <a className="underline" href="/admin/theme">Theme</a>.</span>
      {customised && <form action={ACTION} method="post"><Hidden action="reset" />
        <ConfirmSubmit className="inline-flex items-center gap-1.5 underline" message="Put the homepage back to the default sections, order and settings? Your changes to sections will be lost."><RotateCcw size={14} aria-hidden="true" />Reset to default layout</ConfirmSubmit></form>}
    </div></div>
  </AdminShell>;
}
