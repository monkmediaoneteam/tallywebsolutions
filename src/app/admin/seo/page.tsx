import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import AdminShell from "@/components/AdminShell";
import { resolveSeo } from "@/lib/seo";
import { getSeoRows, indexRows } from "@/lib/seo-store";
import { listEntries } from "@/lib/seo-pages";
import { storeInfo } from "@/lib/seo-meta";
import SeoManager, { type RailPage } from "./SeoManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "SEO", robots: { index: false, follow: false } };

export default async function SeoPage({ searchParams }: { searchParams: Promise<{ page?: string; saved?: string; error?: string }> }) {
  const { page = "/", saved, error } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  const store = storeInfo();
  const [entries, rows] = await Promise.all([listEntries(), getSeoRows()]);
  const { site, overrides } = indexRows(rows);
  // The list is rendered once on the server and filtered in the browser; titles are capped to keep the payload small.
  const pages: RailPage[] = entries.map((e) => {
    const override = overrides.get(e.path);
    const r = resolveSeo({ path: e.path, defaults: e.defaults, site, override, store });
    return { path: e.path, label: e.label, group: e.group, title: r.title.slice(0, 90), noindex: r.noindex, custom: !!override };
  });
  const entry = entries.find((e) => e.path === page);
  const selected = page === "*" || !entry ? (page === "*" ? null : entries[0]) : entry;
  return <AdminShell active="seo" title="SEO" subtitle="Titles, descriptions, social cards, sitemap and structured data for every page">
    {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">{saved === "reset" ? "Reset. The page is back to its defaults." : "Saved. The storefront now shows these SEO settings."}</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error}</p>}
    <SeoManager pages={pages} store={store} site={site} siteStored={rows.some((r) => r.path === "*")}
      selected={selected ? { path: selected.path, label: selected.label, group: selected.group, defaults: selected.defaults, override: overrides.get(selected.path) ?? {} } : null} />
  </AdminShell>;
}
