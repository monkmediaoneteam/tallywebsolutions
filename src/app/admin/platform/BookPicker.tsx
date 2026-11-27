"use client";
import { useMemo, useState } from "react";
import { Check, Search, Tag, X } from "lucide-react";
import { bundlePrice } from "@/lib/bundles";

export type PickerBook = { slug: string; title: string; cover?: string | null; category?: string | null; price?: number | null };

// Pick products by looking at them: a search box, a card per product, and a tray of what is chosen.
// The order products are chosen in is the order they are saved (and shown on the store).
const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", paise % 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;

// With `pricing`, the picker also shows what the chosen products add up to and the bundle's price: a discount percent, or an exact price.
export default function BookPicker({ books, selected, pricing }: { books: PickerBook[]; selected: string[]; pricing?: { percent: number; fixed: number | null } }) {
  const known = useMemo(() => new Map(books.map((b) => [b.slug, b])), [books]);
  const [chosen, setChosen] = useState<string[]>(() => selected.filter((s) => known.has(s)));
  const [q, setQ] = useState("");
  const [onlyChosen, setOnlyChosen] = useState(false);
  const [percent, setPercent] = useState(String(pricing?.percent ?? 0));
  const [exact, setExact] = useState(pricing?.fixed ? String(pricing.fixed / 100) : "");
  const needle = q.trim().toLowerCase();
  const shown = books.filter((b) => (!needle || b.title.toLowerCase().includes(needle) || (b.category ?? "").toLowerCase().includes(needle)) && (!onlyChosen || chosen.includes(b.slug)));
  const toggle = (slug: string) => setChosen((c) => (c.includes(slug) ? c.filter((s) => s !== slug) : [...c, slug]));
  const addShown = () => setChosen((c) => [...c, ...shown.map((b) => b.slug).filter((s) => !c.includes(s))]);
  return <fieldset className="min-w-0 grid gap-3">
    <legend className="mb-1 text-sm font-medium">Products <span className="text-ink-soft font-normal">· {chosen.length} in this pack</span></legend>
    {chosen.map((slug) => <input key={slug} type="hidden" name="book_slugs" value={slug} />)}
    {chosen.length > 0 && <ol className="flex flex-wrap gap-2" aria-label="Chosen products, in order">{chosen.map((slug, i) =>
      <li key={slug} className="chip !min-h-8 gap-2"><span className="text-ink-mute">{i + 1}</span>{known.get(slug)?.title ?? slug}
        <button type="button" onClick={() => toggle(slug)} aria-label={`Remove ${known.get(slug)?.title ?? slug}`} className="text-ink-soft hover:text-danger"><X size={14} aria-hidden="true" /></button></li>)}</ol>}
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1"><span className="sr-only">Search products</span><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or category" className="field-input !pl-9" /></label>
      <button type="button" className="btn btn-ghost !min-h-10 !px-4" onClick={addShown} disabled={!shown.length}>Add all shown ({shown.length})</button>
      <button type="button" className="btn btn-ghost !min-h-10 !px-4" onClick={() => setOnlyChosen((v) => !v)} aria-pressed={onlyChosen}>{onlyChosen ? "Show all" : "Show chosen"}</button>
      {chosen.length > 0 && <button type="button" className="text-sm text-ink-soft underline" onClick={() => setChosen([])}>Clear</button>}
    </div>
    <ul className="grid max-h-[28rem] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-4">{shown.map((b) => {
      const on = chosen.includes(b.slug);
      return <li key={b.slug}><button type="button" onClick={() => toggle(b.slug)} aria-pressed={on}
        className={`relative grid w-full gap-2 rounded-2 border p-2 text-left text-sm transition ${on ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-line bg-bg hover:border-line-2"}`}>
        <span className="grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] bg-bg-2 text-brand">
          {b.cover ? <img src={b.cover} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Tag size={22} aria-hidden="true" />}</span>
        {on && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-brand text-white"><Check size={14} aria-hidden="true" /></span>}
        <span className="min-w-0 break-words font-medium leading-snug">{b.title}</span>
        <span className="text-xs text-ink-mute">{[b.category, typeof b.price === "number" && b.price > 0 ? `₹${Math.round(b.price / 100)}` : null].filter(Boolean).join(" · ") || " "}</span>
      </button></li>;
    })}</ul>
    {!shown.length && <p className="text-sm text-ink-soft">No products match.</p>}
    {pricing && (() => {
      const total = chosen.reduce((sum, slug) => sum + (known.get(slug)?.price ?? 0), 0);
      const pct = Number(percent), exactPaise = exact.trim() ? Math.round(Number(exact) * 100) : null;
      const valid = percent === "" || (Number.isInteger(pct) && pct >= 0 && pct <= 90);
      const price = bundlePrice(total, valid && percent !== "" ? pct : 0, exactPaise && exactPaise > 0 ? exactPaise : null);
      const exactBad = exactPaise !== null && (!(exactPaise > 0) || exactPaise >= total);
      return <div className="mt-2 grid gap-3 rounded-2 border border-line bg-bg-2 p-4">
        <p className="font-medium">Bundle price</p>
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-ink-soft">The {chosen.length} TDLs added up</dt><dd className="font-medium">{inr(total)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-soft">Customers pay</dt><dd className="text-lg font-semibold">{chosen.length >= 2 ? inr(price) : "—"}</dd></div>
          {chosen.length >= 2 && total > price && <div className="flex justify-between gap-4"><dt className="text-ink-soft">They save</dt><dd>{inr(total - price)} ({Math.round(((total - price) / total) * 100)}%)</dd></div>}
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Discount on the total, %<input name="discount_percent" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^0-9]/g, ""))} className="field-input mt-1" /></label>
          <label className="text-sm">Or an exact price, ₹ <span className="text-ink-mute">(optional, replaces the discount)</span><input name="fixed_price" inputMode="decimal" value={exact} placeholder="e.g. 2499" onChange={(e) => setExact(e.target.value.replace(/[^0-9.]/g, ""))} className="field-input mt-1" /></label>
        </div>
        {!valid && <p className="text-xs text-danger" role="alert">The discount is a whole number from 0 to 90.</p>}
        {exactBad && <p className="text-xs text-danger" role="alert">The exact price must be lower than the total, or it is ignored.</p>}
        <p className="text-xs text-ink-soft">A TDL that is on sale counts at its sale price. The price follows the TDLs: add, remove or reprice one and the bundle's price updates. Customers download one ZIP with all the TDLs.</p>
      </div>;
    })()}
  </fieldset>;
}
