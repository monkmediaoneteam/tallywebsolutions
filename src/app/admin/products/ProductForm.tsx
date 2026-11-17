import type { Book } from "@/lib/db";
import { FILE_TYPE_KEYS, FILE_TYPES } from "@/lib/file-types";

const input = "field-input mt-1";

// Fields left over from the catalogue's book days. They are not shown, but are sent back unchanged so saving never clears them.
const KEPT = ["authorship", "author_slug", "publisher", "language", "edition", "year", "isbn", "pages", "cover"] as const;

// The details form on a product's edit page. Each setting has one home: discounts on the Offers screen,
// visibility and "Put on sale" in the Status card, the file and cover image in the Files card.
export default function ProductForm({ book, categories }: { book: Book; categories: { slug: string; name: string }[] }) {
  const field = (name: keyof Book | string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label className="text-sm">{label}<input name={name} className={input} defaultValue={String((book as Record<string, unknown>)[name] ?? "")} {...props} /></label>;
  return <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="details-heading">
    <h2 id="details-heading" className="font-semibold">Product details</h2>
    <form action="/api/admin/products" method="post" className="mt-4 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="action" value="save" /><input type="hidden" name="slug" value={book.slug} />
      {KEPT.map((name) => <input key={name} type="hidden" name={name} value={String((book as Record<string, unknown>)[name] ?? "")} />)}
      {/* Visibility is changed with the Status card's button; saving details keeps it as it is. */}
      {book.active && <input type="hidden" name="active" value="on" />}
      {field("title", "Name", { required: true, maxLength: 200 })}
      {field("subtitle", "Tagline", { maxLength: 200, placeholder: "One line on what it does" })}
      <label className="text-sm">Category<select name="category_slug" className={input} defaultValue={book.category_slug ?? ""}><option value="">None</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
      <label className="text-sm">File type<select name="file_format" className={input} defaultValue={book.file_format ?? "PDF"}>{FILE_TYPE_KEYS.map((key) => <option key={key} value={key.toUpperCase()}>{FILE_TYPES[key].label}</option>)}</select></label>
      {field("price_inr", "Regular price (₹)", { required: true, inputMode: "decimal", defaultValue: (book.price_inr / 100).toFixed(2) })}
      <label className="text-sm">Launch date (optional)<input name="release_date" type="date" className={input} defaultValue={book.release_date ? new Date(book.release_date).toISOString().slice(0, 10) : ""} />
        <span className="mt-1 block text-xs text-ink-soft">A future date shows the product as Coming soon.</span></label>
      <label className="text-sm sm:col-span-2">Short description<textarea name="description" rows={3} className={input} defaultValue={book.description ?? ""} /></label>
      <label className="text-sm sm:col-span-2">About the product<textarea name="long_description" rows={6} className={input} defaultValue={book.long_description ?? ""} /></label>
      <label className="text-sm">Features (one per line)<textarea name="highlights" rows={5} className={input} placeholder={"Shows GSTIN party name on vouchers\nWorks in TallyPrime 4 and later"} defaultValue={(book.highlights || []).join("\n")} /></label>
      <label className="text-sm">Specifications (Key: Value per line)<textarea name="facts" rows={5} className={input} placeholder={"Compatible with: TallyPrime 4.x, 5.x\nLicence: Single site"} defaultValue={Object.entries(book.facts || {}).filter(([k]) => !k.startsWith("_")).map(([k, v]) => `${k}: ${v}`).join("\n")} /></label>
      <p className="text-sm text-ink-soft sm:col-span-2">Changing the file type takes the product off sale until it is put on sale again. Discounts are set on the Offers screen.</p>
      <button className="btn btn-primary justify-self-start" type="submit">Update product</button>
    </form>
  </section>;
}
