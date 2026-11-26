"use client";

import { useMemo, useState } from "react";
import { put } from "@vercel/blob/client";
import { unzipSync } from "fflate";
import { FILE_TYPES, fileTypeFromName, type FileType } from "@/lib/file-types";
import { findBook } from "@/lib/starter-packs";

type Book = { slug: string; title: string; hasFile: boolean; format: string; onSale: boolean };
type Row = { id: number; name: string; bytes: Uint8Array; type: FileType; slug: string; state: "ready" | "busy" | "done" | "error"; message: string; wasOnSale: boolean; sale: "" | "busy" | "done" | "error" };

const MAX = 5 * 1024 * 1024;
const MAX_FILES = 200;

async function post(body: object) {
  const response = await fetch("/api/admin/product-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Upload failed.");
  return result;
}

// Drop a zip of product files. Each file is matched to a product by its name (fix any match by hand), then replaced through the same
// checked upload as the single "Replace file" button. Replacing takes a product off sale until it is put back on sale.
export default function BulkFiles({ books }: { books: Book[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const bySlug = useMemo(() => new Map(books.map((b) => [b.slug, b])), [books]);

  async function load(file: File) {
    setNote(""); setRows([]);
    try {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const found: Row[] = []; const skipped: string[] = [];
      for (const [path, bytes] of Object.entries(entries)) {
        const name = path.split("/").pop() ?? "";
        if (!name || path.endsWith("/") || path.includes("__MACOSX") || name.startsWith(".")) continue;
        const type = fileTypeFromName(name);
        if (!type || bytes.length === 0 || bytes.length > MAX) { skipped.push(name); continue; }
        const book = findBook(books, name.replace(/\.[^.]+$/, ""));
        found.push({ id: found.length, name, bytes, type, slug: book?.slug ?? "", state: "ready", message: "", wasOnSale: false, sale: "" });
        if (found.length >= MAX_FILES) break;
      }
      setRows(found.sort((a, b) => a.name.localeCompare(b.name)));
      if (skipped.length) setNote(`Skipped ${skipped.length} file${skipped.length === 1 ? "" : "s"} that are empty, over 5 MB or not a supported type: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}`);
    } catch { setNote("That file could not be read as a zip."); }
  }

  const chosen = rows.filter((r) => r.slug);
  const duplicates = new Set(chosen.map((r) => r.slug).filter((s, i, all) => all.indexOf(s) !== i));
  const onSaleCount = chosen.filter((r) => bySlug.get(r.slug)?.onSale).length;
  const patch = (id: number, change: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r)));

  async function run() {
    if (running || !chosen.length || duplicates.size) return;
    const warning = `Replace the file on ${chosen.length} product${chosen.length === 1 ? "" : "s"}?\n\nCustomers will receive the new files. ${onSaleCount} that are on sale now are put back on sale as each file is replaced.`;
    if (!window.confirm(warning)) return;
    setRunning(true);
    for (const row of chosen) {
      const book = bySlug.get(row.slug)!;
      patch(row.id, { state: "busy", message: "Uploading…", wasOnSale: book.onSale });
      try {
        const file = new File([row.bytes as BlobPart], row.name, { type: FILE_TYPES[row.type].contentType });
        const ticket = await post({ action: "ticket", slug: row.slug, kind: "pdf", replace: book.hasFile });
        await put(ticket.pathname, file, { access: "private", token: ticket.token, contentType: FILE_TYPES[row.type].contentType });
        await post({ action: "finalize", slug: row.slug, kind: "pdf", fileType: row.type, pathname: ticket.pathname, name: row.name, replace: book.hasFile });
        patch(row.id, { state: "done", message: "File replaced" });
      } catch (e) { patch(row.id, { state: "error", message: e instanceof Error ? e.message : "Failed" }); continue; }
      // A replaced file leaves the product off sale. One that was on sale goes straight back on, so there is no gap and no second step.
      if (book.onSale) {
        patch(row.id, { sale: "busy" });
        const failed = await putOnSale(row.slug);
        patch(row.id, failed ? { sale: "error", message: `File replaced, but not back on sale: ${failed}` } : { sale: "done" });
      }
    }
    setRunning(false);
  }

  async function putOnSale(slug: string): Promise<string> {
    const form = new FormData(); form.set("action", "put-on-sale"); form.set("slug", slug);
    try {
      const response = await fetch("/api/admin/products", { method: "POST", body: form, headers: { Accept: "application/json" } });
      return response.ok ? "" : ((await response.json().catch(() => ({}))) as { error?: string }).error || "Could not put on sale";
    } catch { return "Could not put on sale"; }
  }

  async function putBackOnSale() {
    const targets = rows.filter((r) => r.state === "done" && r.wasOnSale && r.sale !== "done");
    if (!targets.length || running) return;
    setRunning(true);
    for (const row of targets) {
      patch(row.id, { sale: "busy" });
      const failed = await putOnSale(row.slug);
      patch(row.id, failed ? { sale: "error", message: `File replaced, but not back on sale: ${failed}` } : { sale: "done" });
    }
    setRunning(false);
  }

  const done = rows.filter((r) => r.state === "done").length;
  const waiting = rows.filter((r) => r.state === "done" && r.wasOnSale && r.sale !== "done").length;
  return <div className="grid gap-6">
    <div className="rounded-xl border border-line bg-white p-5">
      <label className="grid gap-2 text-sm"><span className="font-medium">Zip of product files</span>
        <input type="file" accept=".zip,application/zip" className="field-input" disabled={running} onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} /></label>
      <p className="mt-2 text-xs text-ink-soft">Each file is matched to a product by its name, ignoring the ending (.tdl, .tcp, .zip). TDL, TCP, ZIP, PDF, EPUB and TXT up to 5 MB. Folders inside the zip are ignored.</p>
      {note && <p className="mt-3 text-sm text-ink-soft" role="status">{note}</p>}
    </div>

    {rows.length > 0 && <>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm"><thead className="border-b border-line bg-bg-2 text-xs uppercase tracking-wide text-ink-soft"><tr>
          <th className="p-3 font-medium">File</th><th className="p-3 font-medium">Product</th><th className="p-3 font-medium">Now</th><th className="p-3 font-medium">Result</th></tr></thead>
          <tbody>{rows.map((r) => { const book = bySlug.get(r.slug);
            return <tr key={r.id} className="border-b border-line last:border-0 align-top">
              <td className="p-3"><span className="break-words font-medium">{r.name}</span><span className="block text-xs text-ink-mute">{FILE_TYPES[r.type].label} · {(r.bytes.length / 1024).toFixed(1)} KB</span></td>
              <td className="p-3"><label className="sr-only" htmlFor={`m-${r.id}`}>Product for {r.name}</label>
                <select id={`m-${r.id}`} className="field-input min-w-56" value={r.slug} disabled={running || r.state !== "ready"} onChange={(e) => patch(r.id, { slug: e.target.value })}>
                  <option value="">Skip this file</option>{books.map((b) => <option key={b.slug} value={b.slug}>{b.title}</option>)}</select>
                {duplicates.has(r.slug) && <span className="mt-1 block text-xs text-danger">Two files point at this product.</span>}
                {!r.slug && <span className="mt-1 block text-xs text-ink-mute">No match found: choose a product or skip.</span>}</td>
              <td className="p-3 text-ink-soft">{book ? `${book.hasFile ? book.format || "file" : "no file"}${book.onSale ? " · on sale" : ""}` : "—"}</td>
              <td className="p-3">{r.state === "error" || r.sale === "error" ? <span className="text-danger">{r.message}</span>
                : r.state === "busy" ? <span className="text-brand">{r.message}</span>
                : r.state === "done" ? <span className="text-brand">{r.sale === "done" ? "Replaced · back on sale" : r.sale === "busy" ? "Putting on sale…" : r.wasOnSale ? "Replaced · off sale for now" : "Replaced"}</span> : ""}</td></tr>; })}</tbody></table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={run} disabled={running || !chosen.length || duplicates.size > 0 || done === chosen.length && done > 0}>
          {running ? "Working…" : `Replace ${chosen.length} file${chosen.length === 1 ? "" : "s"}`}</button>
        {waiting > 0 && <button type="button" className="btn btn-ghost" onClick={putBackOnSale} disabled={running}>Put {waiting} back on sale</button>}
        <p className="text-sm text-ink-soft">{chosen.length} matched · {rows.length - chosen.length} skipped{onSaleCount ? ` · ${onSaleCount} on sale now stay on sale` : ""}</p>
      </div>
    </>}
  </div>;
}
