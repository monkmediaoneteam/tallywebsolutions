import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import AdminShell from "@/components/AdminShell";
import BulkFiles from "./BulkFiles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Update files from a zip", robots: { index: false, follow: false } };

export default async function BulkFilesPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const rows = await sql`select slug, title, file_url, file_format, release_approved, active from books where not coalesce(third_party, false) and coalesce(facts->>'_bundle_of', facts->>'_pack_of', '') = '' order by title` as
    { slug: string; title: string; file_url: string | null; file_format: string | null; release_approved: boolean | null; active: boolean | null }[];
  const books = rows.map((b) => ({ slug: b.slug, title: b.title, hasFile: Boolean(b.file_url), format: b.file_format ?? "", onSale: Boolean(b.release_approved && b.active) }));
  return <AdminShell active="books" title="Update files from a zip" subtitle="Replace many product files at once">
    <BulkFiles books={books} />
  </AdminShell>;
}
