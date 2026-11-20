import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import { getAdminContent } from "@/lib/content";
import AdminShell from "@/components/AdminShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { mergeSections } from "@/lib/banner-sections";
import BannerForm, { type AdminBanner } from "../BannerForm";
import { TONE, bannerState } from "../banner-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit banner", robots: { index: false, follow: false } };

export default async function EditBanner({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [{ id }, { saved, error }] = await Promise.all([params, searchParams]);
  if (!(await isAdmin())) redirect("/admin/login");
  const modules = await getAdminContent("modules") as unknown as (AdminBanner & { type: string; title: string })[];
  const banner = modules.find((m) => m.id === id && m.type === "banner");
  if (!banner) notFound();
  const sections = mergeSections(modules);
  const state = bannerState(banner);
  return <AdminShell active="banners" title={banner.title} subtitle="Edit this banner"
    actions={<div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TONE[state.tone]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{state.label}</span>
      <a className="btn btn-ghost" href="/admin/banners"><ArrowLeft size={16} aria-hidden="true" />All banners</a>
    </div>}>
    {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The site is updated.</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error} None of the changes were applied; fix this and save again.</p>}
    <div className="rounded-xl border border-line bg-white p-5"><BannerForm banner={banner} sections={sections} returnTo={`/admin/banners/${encodeURIComponent(id)}`} /></div>
    <form action="/api/admin/platform/content" method="post" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-white p-5">
      <div><h2 className="font-semibold">Delete this banner</h2><p className="text-sm text-ink-soft">Removes it from the site for good. To keep it for later, set its status to Archived instead.</p></div>
      <input type="hidden" name="section" value="modules" /><input type="hidden" name="id" value={banner.id} /><input type="hidden" name="updated_at" value={banner.updated_at} />
      <input type="hidden" name="return_to" value={`/admin/banners/${encodeURIComponent(id)}`} /><input type="hidden" name="done_to" value="/admin/banners" />
      <ConfirmSubmit name="action" value="delete" formNoValidate className="btn btn-ghost !text-danger" message={`Delete the banner "${banner.title}"? This cannot be undone.`}><Trash2 size={16} aria-hidden="true" />Delete banner</ConfirmSubmit>
    </form>
  </AdminShell>;
}
