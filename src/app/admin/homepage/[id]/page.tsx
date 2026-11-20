import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import { readSiteSetting } from "@/lib/site-settings";
import AdminShell from "@/components/AdminShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { cleanLayout, defaultLayout, resolveSection, typeOf } from "@/lib/home-sections";
import SectionEditor from "../SectionEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit homepage section", robots: { index: false, follow: false } };

export default async function EditHomepageSection({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [{ id }, { saved, error }] = await Promise.all([params, searchParams]);
  if (!(await isAdmin())) redirect("/admin/login");
  const stored = await readSiteSetting("home_layout");
  const layout = stored.value ? cleanLayout(stored.value, false) : defaultLayout();
  const section = (layout.sections.length ? layout : defaultLayout()).sections.find((s) => s.id === id);
  if (!section) notFound();
  const t = typeOf(section.type)!;
  const r = resolveSection(section);
  return <AdminShell active="homepage" title={(r.settings.heading as string) || t.label} subtitle={`${t.label} · ${t.description}`}
    actions={<div className="flex flex-wrap gap-2">
      <a className="btn btn-ghost" href="/admin/homepage"><ArrowLeft size={16} aria-hidden="true" />All sections</a>
      <a className="btn btn-ghost" href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />Open storefront</a></div>}>
    {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The storefront is updated.</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error}</p>}
    <div className="max-w-3xl">
      <SectionEditor key={`${id}:${JSON.stringify(section).length}`} id={id} type={section.type} settings={r.settings} blocks={r.blocks} />
      {t.removable && <form action="/api/admin/homepage" method="post" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-white p-5">
        <div><h2 className="font-semibold">Delete this section</h2><p className="text-sm text-ink-soft">Removes it from the homepage. You can add it again later from Add section.</p></div>
        <input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="delete" />
        <ConfirmSubmit className="btn btn-ghost !text-danger" message={`Delete the section "${(r.settings.heading as string) || t.label}"?`}><Trash2 size={16} aria-hidden="true" />Delete section</ConfirmSubmit>
      </form>}
    </div>
  </AdminShell>;
}
