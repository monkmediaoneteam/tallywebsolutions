"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import type { ProductStatus } from "@/lib/product-status";
import StatusBadge from "./StatusBadge";

export type ProductRow = {
  slug: string;
  title: string;
  cover: string | null;
  category: string | null;
  format: string;
  price: number;
  salePrice: number | null;
  orders: number;
  status: ProductStatus;
  editable: boolean; // developer submissions are changed through their own page, not bulk actions
};

type Pending = { op: "show" | "hide" | "delete"; slugs: string[] };
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The products list: select rows (or all on this page), then show, hide or delete them together.
// Every action posts to the products API, which checks it again and reports what it did.
export default function ProductTable({ rows, query = "" }: { rows: ProductRow[]; query?: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const all = useRef<HTMLInputElement>(null);
  const selectable = rows.filter((r) => r.editable).map((r) => r.slug);
  const count = selectable.filter((slug) => selected.has(slug)).length;
  const allChecked = selectable.length > 0 && count === selectable.length;

  useEffect(() => { if (all.current) all.current.indeterminate = count > 0 && !allChecked; }, [count, allChecked]);
  useEffect(() => { if (pending) dialog.current?.showModal(); else dialog.current?.close(); }, [pending]);

  const toggle = (slug: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    return next;
  });
  const chosen = selectable.filter((slug) => selected.has(slug));
  const titleOf = (slug: string) => rows.find((r) => r.slug === slug)?.title ?? slug;
  const confirmText = pending && (pending.slugs.length === 1 ? `“${titleOf(pending.slugs[0])}”` : `${pending.slugs.length} products`);

  return <>
    <div className={`flex min-h-12 flex-wrap items-center gap-2 border-b border-line px-4 py-2 ${count ? "bg-brand/5" : ""}`} aria-live="polite">
      {count ? <>
        <span className="mr-auto text-sm font-medium">{count} selected</span>
        <button type="button" className="btn btn-ghost min-h-9 px-3 py-1.5 text-sm" onClick={() => setPending({ op: "show", slugs: chosen })}><Eye size={15} aria-hidden="true" />Show in store</button>
        <button type="button" className="btn btn-ghost min-h-9 px-3 py-1.5 text-sm" onClick={() => setPending({ op: "hide", slugs: chosen })}><EyeOff size={15} aria-hidden="true" />Remove from store</button>
        <button type="button" className="btn btn-ghost min-h-9 px-3 py-1.5 text-sm text-danger" onClick={() => setPending({ op: "delete", slugs: chosen })}><Trash2 size={15} aria-hidden="true" />Delete</button>
        <button type="button" className="px-2 text-sm text-ink-soft underline" onClick={() => setSelected(new Set())}>Clear</button>
      </> : <span className="text-sm text-ink-soft">Select products to show, hide or delete them together.</span>}
    </div>

    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-bg-2">
          <tr className="text-left text-ink-soft">
            <th scope="col" className="w-10 p-3">
              <input ref={all} type="checkbox" aria-label="Select all products on this page" checked={allChecked} disabled={!selectable.length}
                onChange={() => setSelected(allChecked ? new Set() : new Set(selectable))} className="h-4 w-4 accent-[color:var(--color-brand)]" />
            </th>
            <th scope="col" className="p-3 font-medium">Product</th>
            <th scope="col" className="p-3 font-medium">Category</th>
            <th scope="col" className="p-3 font-medium">File type</th>
            <th scope="col" className="p-3 font-medium">Status</th>
            <th scope="col" className="p-3 text-right font-medium">Orders</th>
            <th scope="col" className="p-3 text-right font-medium">Price</th>
            <th scope="col" className="p-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const edit = `/admin/products/${encodeURIComponent(r.slug)}`;
            const isSelected = selected.has(r.slug);
            return <tr key={r.slug} className={`border-t border-line ${isSelected ? "bg-brand/5" : "hover:bg-bg-2"}`}>
              <td className="p-3">
                <input type="checkbox" checked={isSelected} disabled={!r.editable} onChange={() => toggle(r.slug)} className="h-4 w-4 accent-[color:var(--color-brand)]"
                  aria-label={r.editable ? `Select ${r.title}` : `${r.title} is a developer submission; open it to change visibility`} />
              </td>
              <td className="p-3">
                <div className="flex items-center gap-3">
                  {r.cover ? <img src={r.cover} alt="" className="h-10 w-10 shrink-0 rounded-1 border border-line object-cover" />
                    : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-1 bg-bg-3 text-[10px] text-ink-soft" aria-hidden="true">{r.format}</span>}
                  <div className="min-w-0">
                    <a href={edit} className="font-medium hover:underline">{r.title}</a>
                    <p className="truncate text-xs text-ink-soft">{r.slug}</p>
                  </div>
                </div>
              </td>
              <td className="p-3">{r.category ?? <span className="text-ink-soft">—</span>}</td>
              <td className="p-3">{r.format}</td>
              <td className="p-3"><StatusBadge status={r.status} /></td>
              <td className="p-3 text-right tabular-nums">{r.orders}</td>
              <td className="p-3 text-right tabular-nums">
                {r.salePrice ? <><span className="font-medium">{rupees(r.salePrice)}</span><br /><s className="text-xs text-ink-soft">{rupees(r.price)}</s></> : r.price > 0 ? rupees(r.price) : <span className="text-ink-soft">Not set</span>}
              </td>
              <td className="p-3">
                <div className="flex justify-end gap-1">
                  <a href={`/products/${encodeURIComponent(r.slug)}`} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center rounded-1 text-ink-soft hover:bg-bg-3 hover:text-ink" title="View in store" aria-label={`View ${r.title} in store`}><ExternalLink size={16} aria-hidden="true" /></a>
                  <a href={edit} className="grid h-8 w-8 place-items-center rounded-1 text-ink-soft hover:bg-bg-3 hover:text-ink" title="Edit" aria-label={`Edit ${r.title}`}><Pencil size={16} aria-hidden="true" /></a>
                  <button type="button" disabled={!r.editable} onClick={() => setPending({ op: "delete", slugs: [r.slug] })} className="grid h-8 w-8 place-items-center rounded-1 text-danger hover:bg-danger/10 disabled:opacity-30"
                    title={r.editable ? "Delete" : "Developer submissions cannot be deleted"} aria-label={`Delete ${r.title}`}><Trash2 size={16} aria-hidden="true" /></button>
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    <dialog ref={dialog} onClose={() => setPending(null)} className="m-auto w-[min(92vw,440px)] rounded-xl border border-line bg-white p-0 text-ink backdrop:bg-ink/40" aria-labelledby="bulk-title">
      {pending && <form action="/api/admin/products" method="post" className="grid gap-4 p-6">
        <input type="hidden" name="action" value="bulk" />
        <input type="hidden" name="op" value={pending.op} />
        <input type="hidden" name="back" value={query} />
        {pending.slugs.map((slug) => <input key={slug} type="hidden" name="slugs" value={slug} />)}
        <h2 id="bulk-title" className="text-lg font-semibold">
          {pending.op === "delete" ? `Delete ${confirmText}?` : pending.op === "hide" ? `Remove ${confirmText} from the store?` : `Show ${confirmText} in the store?`}
        </h2>
        <p className="text-sm text-ink-soft">{pending.op === "delete"
          ? "This cannot be undone. Products with orders or wishlists are kept; remove those from the store instead."
          : pending.op === "hide" ? "Customers will no longer see them. You can restore them at any time." : "They will be visible to customers again. Only products that are released can be bought."}</p>
        {pending.op === "delete" && <label className="flex items-start gap-2 text-[15px]">
          <input type="checkbox" name="confirmed" required className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--color-brand)]" />I understand this is permanent.</label>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>Cancel</button>
          <button type="submit" className="btn btn-primary" style={pending.op === "delete" ? { background: "var(--color-danger)" } : undefined}>
            {pending.op === "delete" ? "Delete" : pending.op === "hide" ? "Remove from store" : "Show in store"}</button>
        </div>
      </form>}
    </dialog>
  </>;
}
