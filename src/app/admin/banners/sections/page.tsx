import { redirect } from "next/navigation";
import { ArrowLeft, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import { getAdminContent } from "@/lib/content";
import AdminShell from "@/components/AdminShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { LAYOUTS, POSITIONS, mergeSections, sectionKeyOf, sizeLabel } from "@/lib/banner-sections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Banner sections", robots: { index: false, follow: false } };

const icon = "grid h-8 w-8 place-items-center rounded-1 text-ink-soft hover:bg-bg-3 hover:text-ink";

export default async function SectionsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  const modules = await getAdminContent("modules") as unknown as { id: string; type: string; title: string; sort: number; payload: Record<string, unknown>; updated_at: string }[];
  const sections = mergeSections(modules);
  const count = (key: string) => modules.filter((m) => m.type === "banner" && sectionKeyOf(m.payload?.placement) === key).length;

  return <AdminShell active="banners" title="Banner sections" subtitle="Where image banners appear, their layout, how many show and at what size."
    actions={<div className="flex flex-wrap gap-2">
      <a className="btn btn-ghost" href="/admin/banners"><ArrowLeft size={16} aria-hidden="true" />Banners</a>
      <a className="btn btn-primary" href="/admin/banners/sections/new"><Plus size={16} aria-hidden="true" />Add section</a></div>}>
    {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The site is updated.</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error}</p>}

    <div className="overflow-hidden rounded-xl border border-line bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
      <thead className="bg-bg-2"><tr className="text-left text-ink-soft">
        <th scope="col" className="p-3 font-medium">Section</th><th scope="col" className="p-3 font-medium">Where</th><th scope="col" className="p-3 font-medium">Layout</th>
        <th scope="col" className="p-3 font-medium">Image size</th><th scope="col" className="p-3 text-right font-medium">Shows</th><th scope="col" className="p-3 text-right font-medium">Banners</th>
        <th scope="col" className="p-3 font-medium">Status</th><th scope="col" className="p-3 text-right font-medium">Actions</th>
      </tr></thead>
      <tbody>{sections.map((s) => {
        const edit = `/admin/banners/sections/${encodeURIComponent(s.key)}`;
        const n = count(s.key);
        return <tr key={s.key} className="border-t border-line hover:bg-bg-2">
          <td className="p-3"><a href={edit} className="font-medium hover:underline">{s.name}</a>
            <p className="text-xs text-ink-soft">{s.key} · {s.builtIn ? (s.id ? "Built-in, customised" : "Built-in") : "Custom"}</p></td>
          <td className="p-3">{POSITIONS[s.position].label}</td>
          <td className="p-3">{LAYOUTS[s.layout].split(":")[0]}{s.layout === "grid" ? `, ${s.columns} across` : ""}</td>
          <td className="p-3 tabular-nums">{sizeLabel(s.width, s.height)}<p className="text-xs text-ink-soft">phone {sizeLabel(s.mobileWidth, s.mobileHeight)}</p></td>
          <td className="p-3 text-right tabular-nums">{s.max}</td>
          <td className="p-3 text-right tabular-nums"><a className="hover:underline" href={`/admin/banners?section=${encodeURIComponent(s.key)}`}>{n}</a></td>
          <td className="p-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.enabled ? "bg-brand/10 text-brand" : "bg-bg-3 text-ink-soft"}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{s.enabled ? "On" : "Off"}</span></td>
          <td className="p-3"><div className="flex justify-end gap-1">
            <a href={`/admin/banners/new?section=${encodeURIComponent(s.key)}`} className={icon} title="Add a banner to this section" aria-label={`Add a banner to ${s.name}`}><Plus size={16} aria-hidden="true" /></a>
            <a href={edit} className={icon} title="Edit" aria-label={`Edit ${s.name}`}><Pencil size={16} aria-hidden="true" /></a>
            {s.id ? <form action="/api/admin/platform/content" method="post">
              <input type="hidden" name="section" value="modules" /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="updated_at" value={s.updatedAt ?? ""} />
              <input type="hidden" name="return_to" value="/admin/banners/sections" />
              <ConfirmSubmit name="action" value="delete" className={`${icon} ${s.builtIn ? "" : "!text-danger hover:!bg-danger/10"}`} title={s.builtIn ? "Reset to default" : "Delete"}
                aria-label={`${s.builtIn ? "Reset" : "Delete"} ${s.name}`}
                message={s.builtIn ? `Reset "${s.name}" to its default settings?` : `Delete the section "${s.name}"?${n ? ` Its ${n} banner${n === 1 ? "" : "s"} stay saved but stop showing until moved to another section.` : ""}`}>
                {s.builtIn ? <RotateCcw size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}</ConfirmSubmit>
            </form> : <span className={`${icon} opacity-30`} title="Built-in sections cannot be deleted" aria-hidden="true"><Trash2 size={16} /></span>}
          </div></td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className="border-t border-line px-4 py-3 text-sm text-ink-soft">{sections.length} sections. Built-in ones can be changed or reset but not deleted; add your own for any other spot.</p></div>
  </AdminShell>;
}
