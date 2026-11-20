import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { sql } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import AdminShell from "@/components/AdminShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { formatBytes, kindOf, storageReport, type Usage } from "@/lib/storage";
import { blobApi } from "@/lib/storage-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Storage", robots: { index: false, follow: false } };

const KIND_LABEL = { image: "Banner and site images", product: "Product files", cover: "Product covers" } as const;

export default async function StoragePage({ searchParams }: { searchParams: Promise<{ swept?: string; freed?: string; error?: string }> }) {
  const { swept, freed, error } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  let report: Usage | null = null;
  let failed = false;
  if (token) { try { report = await storageReport(sql as never, blobApi(token)); } catch { failed = true; } }

  return <AdminShell active="storage" title="Storage" subtitle="Every uploaded image and product file, and what can be cleaned up.">
    {swept !== undefined && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">
      {Number(swept) ? `Deleted ${swept} unused file${swept === "1" ? "" : "s"} and freed ${formatBytes(Number(freed) || 0)}.` : "Nothing to delete: every file is in use."}</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert">{error}</p>}

    {!token && <div className="rounded-xl border border-gold/40 bg-gold/5 p-5">
      <h2 className="font-semibold">File storage is not connected</h2>
      <p className="mt-1 text-sm text-ink-soft">Uploads (banner images, product files and covers) need a private Vercel Blob store.</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
        <li>In Vercel, open this project, then Storage, then Create, then Blob.</li>
        <li>Set access to <strong>Private</strong>, and connect it to this project for all environments.</li>
        <li>Redeploy. This adds <code>BLOB_READ_WRITE_TOKEN</code>, and this screen then shows what is stored.</li>
      </ol>
    </div>}
    {failed && <p className="rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert">Could not read the storage. Check the Blob connection and reload.</p>}

    {report && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-ink-soft">All files</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatBytes(report.total.bytes)}</p><p className="text-xs text-ink-soft">{report.total.files} file{report.total.files === 1 ? "" : "s"}</p></div>
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => <div key={k} className="rounded-xl border border-line bg-white p-4">
          <p className="text-sm text-ink-soft">{KIND_LABEL[k]}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatBytes(report.byKind[k].bytes)}</p><p className="text-xs text-ink-soft">{report.byKind[k].files} file{report.byKind[k].files === 1 ? "" : "s"}</p></div>)}
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-line bg-white" aria-labelledby="unused">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div><h2 id="unused" className="font-semibold">Unused files</h2>
            <p className="text-sm text-ink-soft">{report.unused.length ? `${report.unused.length} file${report.unused.length === 1 ? "" : "s"}, ${formatBytes(report.unusedBytes)}. Nothing on the site, in the catalogue or in any order uses them.` : "None. Every file is in use."}
              {report.recent ? ` ${report.recent} newer than an hour ${report.recent === 1 ? "is" : "are"} skipped, in case a form is still open.` : ""}</p></div>
          {report.unused.length > 0 && <form action="/api/admin/storage" method="post" className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="action" value="sweep" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmed" required className="h-4 w-4 accent-[color:var(--color-brand)]" />I understand this is permanent.</label>
            <ConfirmSubmit className="btn btn-primary !bg-danger" message={`Permanently delete ${report.unused.length} unused file${report.unused.length === 1 ? "" : "s"} (${formatBytes(report.unusedBytes)})?`}><Trash2 size={16} aria-hidden="true" />Delete unused files</ConfirmSubmit>
          </form>}
        </div>
        {report.unused.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead className="bg-bg-2"><tr className="text-left text-ink-soft"><th scope="col" className="p-3 font-medium">File</th><th scope="col" className="p-3 font-medium">Type</th><th scope="col" className="p-3 text-right font-medium">Size</th><th scope="col" className="p-3 font-medium">Uploaded</th></tr></thead>
          <tbody>{report.unused.slice(0, 100).map((f) => <tr key={f.pathname} className="border-t border-line">
            <td className="max-w-[360px] truncate p-3 font-mono text-xs" title={f.pathname}>{f.pathname}</td>
            <td className="p-3">{KIND_LABEL[kindOf(f.pathname)]}</td><td className="p-3 text-right tabular-nums">{formatBytes(f.size)}</td>
            <td className="p-3 text-ink-soft">{f.uploadedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</td></tr>)}</tbody>
        </table>{report.unused.length > 100 && <p className="border-t border-line p-3 text-sm text-ink-soft">Showing the 100 largest of {report.unused.length}.</p>}</div>}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-white p-5 text-sm text-ink-soft">
        <h2 className="font-semibold text-ink">How files are kept tidy</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Replacing a product file or cover removes the old one automatically.</li>
          <li>Deleting a product, banner, category or author removes its images and files.</li>
          <li>A file that a customer bought is always kept, so they can download it again.</li>
          <li>Files uploaded but never saved are listed above after an hour. Delete them here.</li>
        </ul>
      </section>
    </>}
  </AdminShell>;
}
