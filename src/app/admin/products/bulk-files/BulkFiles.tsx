"use client";

import { useMemo, useState } from "react";
import { put } from "@vercel/blob/client";
import { unzipSync } from "fflate";
import { FILE_TYPES, fileTypeFromName, type FileType } from "@/lib/file-types";
import { findBook } from "@/lib/starter-packs";

type Book = { slug: string; title: string; hasFile: boolean; format: string; onSale: boolean };
type Row = { id: number; name: string; title: string; bytes: Uint8Array; type: FileType; slug: string; price: string;
  state: "ready" | "busy" | "done" | "error"; message: string };

const MAX = 5 * 1024 * 1024;
const MAX_FILES = 200;
const NEW = "__new__";

async function upload(body: object) {
  const response = await fetch("/api/admin/product-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Upload failed.");
  return result;
}

// A product action (create, price, show, put-on-sale). Returns the address it ended at, so a new product's slug can be read.
async function product(fields: Record<string, string>): Promise<string> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const response = await fetch("/api/admin/products", { method: "POST", body: form, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "The product could not be saved.");
  return response.url;
}

// Drop a zip of product files. Each file is matched to a product by its name (fix any match by hand). A file with no product can create one.
// Files go through the same checked upload as the single "Replace file" button; products that were on sale go straight back on sale.
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
        const title = name.replace(/\.[^.]+$/, "");
        const book = findBook(books, title);
        found.push({ id: found.length, name, title, bytes, type, slug: book?.slug ?? NEW, price: "", state: "ready", message: "" });
        if (found.length >= MAX_FILES) break;
      }
      setRows(found.sort((a, b) => a.name.localeCompare(b.name)));
      if (skipped.length) setNote(`Skipped ${skipped.length} file${skipped.length === 1 ? "" : "s"} that are empty, over 5 MB or not a supported type: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}`);
    } catch { setNote("That file could not be read as a zip."); }
  }

  const chosen = rows.filter((r) => r.slug);
  const replacing = chosen.filter((r) => r.slug !== NEW);
  const creating = chosen.filter((r) => r.slug === NEW);
  const duplicates = new Set(replacing.map((r) => r.slug).filter((s, i, all) => all.indexOf(s) !== i));
  const onSaleCount = replacing.filter((r) => bySlug.get(r.slug)?.onSale).length;
  const patch = (id: number, change: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r)));

  async function run() {
    if (running || !chosen.length || duplicates.size) return;
    const lines = [`Replace the file on ${replacing.length} product${replacing.length === 1 ? "" : "s"}${creating.length ? ` and create ${creating.length} new product${creating.length === 1 ? "" : "s"}` : ""}?`,
      "", "Customers will receive the new files.", onSaleCount ? `${onSaleCount} product${onSaleCount === 1 ? "" : "s"} on sale now go straight back on sale.` : "",
      creating.length ? `New products with a price go on sale; the rest stay hidden until you add a price.` : ""].filter((l, i) => l || i === 1);
    if (!window.confirm(lines.join("\n"))) return;
    setRunning(true);
    for (const row of chosen) {
      const isNew = row.slug === NEW;
      patch(row.id, { state: "busy", message: isNew ? "Creating product…" : "Uploading…" });
      let slug = row.slug;
      const book = isNew ? undefined : bySlug.get(slug);
      try {
        if (isNew) {
          const url = await product({ action: "create", title: row.title });
          slug = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
          if (!slug || slug === "products") throw new Error("The new product could not be found.");
          if (row.price.trim()) await product({ action: "price", slug, price: row.price.trim() });
        }
        patch(row.id, { message: "Uploading…" });
        const file = new File([row.bytes as BlobPart], row.name, { type: FILE_TYPES[row.type].contentType });
        const replace = Boolean(book?.hasFile);
        const ticket = await upload({ action: "ticket", slug, kind: "pdf", replace });
        await put(ticket.pathname, file, { access: "private", token: ticket.token, contentType: FILE_TYPES[row.type].contentType });
        await upload({ action: "finalize", slug, kind: "pdf", fileType: row.type, pathname: ticket.pathname, name: row.name, replace });
        // A replaced file leaves the product off sale. One that was on sale goes straight back on; a new one with a price is shown and put on sale.
        if (book?.onSale || (isNew && row.price.trim())) {
          patch(row.id, { message: "Putting on sale…" });
          if (isNew) await product({ action: "show", slug });
          await product({ action: "put-on-sale", slug });
          patch(row.id, { state: "done", message: isNew ? "Created · on sale" : "Replaced · on sale" });
        } else patch(row.id, { state: "done", message: isNew ? "Created · add a price to sell it" : "Replaced" });
      } catch (e) { patch(row.id, { state: "error", message: e instanceof Error ? e.message : "Failed" }); }
    }
    setRunning(false);
  }

  const finished = chosen.length > 0 && chosen.every((r) => r.state === "done");
  return <div className="grid gap-6">
    <div className="rounded-xl border border-line bg-white p-5">
      <label className="grid gap-2 text-sm"><span className="font-medium">Zip of product files</span>
        <input type="file" accept=".zip,application/zip" className="field-input" disabled={running} onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} /></label>
      <p className="mt-2 text-xs text-ink-soft">Each file is matched to a product by its name, ignoring the ending (.tdl, .tcp, .zip). A file with no product creates a new one. TDL, TCP, ZIP, PDF, EPUB and TXT up to 5 MB. Folders inside the zip are ignored.</p>
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
                  <option value={NEW}>Create a new product: {r.title}</option><option value="">Skip this file</option>{books.map((b) => <option key={b.slug} value={b.slug}>{b.title}</option>)}</select>
                {r.slug === NEW && <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">Price ₹
                  <input inputMode="decimal" className="field-input !min-h-9 w-28" placeholder="e.g. 250" value={r.price} disabled={running || r.state !== "ready"}
                    onChange={(e) => patch(r.id, { price: e.target.value.replace(/[^0-9.]/g, "") })} /><span>blank = stays hidden</span></label>}
                {duplicates.has(r.slug) && <span className="mt-1 block text-xs text-danger">Two files point at this product.</span>}</td>
              <td className="p-3 text-ink-soft">{r.slug === NEW ? "new" : book ? `${book.hasFile ? book.format || "file" : "no file"}${book.onSale ? " · on sale" : ""}` : "—"}</td>
              <td className="p-3">{r.state === "error" ? <span className="text-danger">{r.message}</span> : r.state === "busy" || r.state === "done" ? <span className="text-brand">{r.message}</span> : ""}</td></tr>; })}</tbody></table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={run} disabled={running || !chosen.length || duplicates.size > 0 || finished}>
          {running ? "Working…" : `Replace ${replacing.length}${creating.length ? ` and create ${creating.length}` : ""}`}</button>
        <p className="text-sm text-ink-soft">{replacing.length} to replace · {creating.length} to create · {rows.length - chosen.length} skipped{onSaleCount ? ` · ${onSaleCount} on sale now stay on sale` : ""}</p>
      </div>
    </>}
  </div>;
}
