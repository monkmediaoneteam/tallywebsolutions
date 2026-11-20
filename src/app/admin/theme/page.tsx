import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import { readSiteSetting } from "@/lib/site-settings";
import AdminShell from "@/components/AdminShell";
import { themeValues } from "@/lib/theme";
import ThemeForm from "./ThemeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Theme", robots: { index: false, follow: false } };

export default async function ThemePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  const stored = await readSiteSetting("theme");
  return <AdminShell active="theme" title="Theme" subtitle="Colours, page width, corners and buttons for the whole storefront."
    actions={<a className="btn btn-ghost" href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />Open storefront</a>}>
    {stored.missing && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert">Changes cannot be saved yet: apply the database migration <code>013-site-settings.sql</code>.</p>}
    {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The storefront is updated.</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error}</p>}
    <ThemeForm initial={themeValues(stored.value)} customised={!!stored.value} />
  </AdminShell>;
}
