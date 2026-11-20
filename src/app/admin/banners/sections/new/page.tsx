import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import AdminShell from "@/components/AdminShell";
import type { BannerSection } from "@/lib/banner-sections";
import SectionForm from "../SectionForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add banner section", robots: { index: false, follow: false } };

const blank: BannerSection = { key: "", name: "", position: "home-after-categories", layout: "grid", max: 3, columns: 3, width: 800, height: 450,
  mobileWidth: 800, mobileHeight: 600, autoplay: 0, empty: "hide", fit: "cover", enabled: true, sort: 50, builtIn: false };

export default async function NewSection({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  return <AdminShell active="banners" title="Add section" subtitle="A new place on the site for banners, with its own layout and size."
    actions={<a className="btn btn-ghost" href="/admin/banners/sections"><ArrowLeft size={16} aria-hidden="true" />All sections</a>}>
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error}</p>}
    <div className="rounded-xl border border-line bg-white p-5"><SectionForm section={blank} isNew returnTo="/admin/banners/sections/new" doneTo="/admin/banners/sections" /></div>
  </AdminShell>;
}
