import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import { getAdminContent } from "@/lib/content";
import AdminShell from "@/components/AdminShell";
import { mergeSections } from "@/lib/banner-sections";
import BannerForm from "../BannerForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add banner", robots: { index: false, follow: false } };

export default async function NewBanner({ searchParams }: { searchParams: Promise<{ error?: string; section?: string }> }) {
  const { error, section } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  const sections = mergeSections(await getAdminContent("modules") as unknown as { id: string; type: string; title: string; sort: number; payload: Record<string, unknown> }[]);
  return <AdminShell active="banners" title="Add banner" subtitle="Choose the section, then the image. The section decides the size and where it shows."
    actions={<a className="btn btn-ghost" href="/admin/banners"><ArrowLeft size={16} aria-hidden="true" />All banners</a>}>
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error}</p>}
    <div className="rounded-xl border border-line bg-white p-5"><BannerForm sections={sections} sectionKey={sections.some((s) => s.key === section) ? section : undefined} returnTo="/admin/banners/new" doneTo="/admin/banners" /></div>
  </AdminShell>;
}
