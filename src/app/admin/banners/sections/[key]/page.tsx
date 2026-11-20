import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus, RotateCcw, Trash2 } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import { getAdminContent } from "@/lib/content";
import AdminShell from "@/components/AdminShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { mergeSections, sectionKeyOf } from "@/lib/banner-sections";
import SectionForm from "../SectionForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit banner section", robots: { index: false, follow: false } };

export default async function EditSection({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [{ key }, { saved, error }] = await Promise.all([params, searchParams]);
  if (!(await isAdmin())) redirect("/admin/login");
  const modules = await getAdminContent("modules") as unknown as { id: string; type: string; title: string; sort: number; payload: Record<string, unknown>; updated_at: string }[];
  const section = mergeSections(modules).find((s) => s.key === key);
  if (!section) notFound();
  const n = modules.filter((m) => m.type === "banner" && sectionKeyOf(m.payload?.placement) === key).length;
  const here = `/admin/banners/sections/${encodeURIComponent(key)}`;
  return <AdminShell active="banners" title={section.name} subtitle={`${section.builtIn ? "Built-in section" : "Custom section"} · ${n} banner${n === 1 ? "" : "s"}`}
    actions={<div className="flex flex-wrap gap-2">
      <a className="btn btn-ghost" href="/admin/banners/sections"><ArrowLeft size={16} aria-hidden="true" />All sections</a>
      <a className="btn btn-ghost" href={`/admin/banners/new?section=${encodeURIComponent(key)}`}><Plus size={16} aria-hidden="true" />Add banner here</a></div>}>
    {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The site is updated.</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error} None of the changes were applied; fix this and save again.</p>}
    <div className="rounded-xl border border-line bg-white p-5"><SectionForm section={section} returnTo={here} /></div>
    {section.id ? <form action="/api/admin/platform/content" method="post" className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-5 ${section.builtIn ? "border-line" : "border-danger/30"}`}>
      <div><h2 className="font-semibold">{section.builtIn ? "Reset to default" : "Delete this section"}</h2>
        <p className="text-sm text-ink-soft">{section.builtIn ? "Goes back to the built-in layout and size. Its banners are kept." : `Removes the section.${n ? ` Its ${n} banner${n === 1 ? "" : "s"} stay saved but stop showing until moved to another section.` : ""}`}</p></div>
      <input type="hidden" name="section" value="modules" /><input type="hidden" name="id" value={section.id} /><input type="hidden" name="updated_at" value={section.updatedAt ?? ""} />
      <input type="hidden" name="return_to" value={here} /><input type="hidden" name="done_to" value="/admin/banners/sections" />
      <ConfirmSubmit name="action" value="delete" formNoValidate className={`btn btn-ghost ${section.builtIn ? "" : "!text-danger"}`}
        message={section.builtIn ? `Reset "${section.name}" to its default settings?` : `Delete the section "${section.name}"?`}>
        {section.builtIn ? <RotateCcw size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}{section.builtIn ? "Reset to default" : "Delete section"}</ConfirmSubmit>
    </form> : <p className="mt-6 text-sm text-ink-soft">This built-in section is using its defaults. Save changes above to customise it.</p>}
  </AdminShell>;
}
