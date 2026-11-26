import { notFound, redirect } from "next/navigation";
import { Save, Trash2, Plus, Eye } from "lucide-react";
import Link from "next/link";
import { isAdmin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { contentSections, getAdminContent, type ContentSection } from "@/lib/content";
import ActionForm from "@/components/ActionForm";
import ModuleFields from "../ModuleFields";
import BookPicker, { type PickerBook } from "../BookPicker";
import TitleAndSlug from "../TitleAndSlug";
import { STORE } from "@/lib/store";

export default async function ContentPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ type?: string; saved?: string; packs?: string; missing?: string; pack?: string; count?: string; packerror?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { section } = await params;
  if (!contentSections.includes(section as ContentSection)) notFound();
  const selected = section as ContentSection;
  const { type, saved, packs, missing, pack, count, packerror } = await searchParams;
  // A pack's own product (one per collection), if it has been built.
  const packProducts = new Map((selected === "collections" ? await sql`select slug, price_inr, sale_price_inr, release_approved, active from books where facts->>'_pack_of' is not null` as
    { slug: string; price_inr: number; sale_price_inr: number | null; release_approved: boolean; active: boolean }[] : []).map((p) => [p.slug, p]));
  const records = (await getAdminContent(selected)).filter(record => !(selected === "modules" && type) || record.type === type);
  const books = selected === "collections" ? (await sql`select b.slug, b.title, b.cover, b.price_inr, c.name as category from books b left join categories c on c.slug = b.category_slug order by b.title` as { slug: string; title: string; cover: string | null; price_inr: number | null; category: string | null }[])
    .map(({ price_inr, ...b }) => ({ ...b, price: price_inr })) : [];
  const collections = selected === "modules" ? await sql`select slug,title from content_collections order by title` as { slug: string; title: string }[] : [];
  const authors = selected === "modules" ? await sql`select id,name from author_profiles order by name` as { id: string; name: string }[] : [];
  const categories = selected === "modules" ? await sql`select slug,name from categories order by sort,name` as { slug: string; name: string }[] : [];
  const options = { books, collections, authors, categories };
  return <section>
    {saved && <p className="mb-6 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The store is updated.</p>}
    {packs !== undefined && <p className="mb-6 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">
      {Number(packs) > 0 ? `Created ${packs} pack${packs === "1" ? "" : "s"}.` : "The starter packs already exist; nothing was changed."}
      {Number(missing) > 0 && ` ${missing} add-on title${missing === "1" ? "" : "s"} from your list ${missing === "1" ? "was" : "were"} not found in Products, so those are left out until you add them.`}
      {" "}Next, open each one and click Create pack product to sell it as a single product.</p>}
    {pack && <p className="mb-6 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">The pack product is ready: {count} add-ons in one download. <Link className="underline" href={`/products/${encodeURIComponent(pack)}`}>View it in the store</Link>.</p>}
    {packerror && <p className="mb-6 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert">{packerror}</p>}
    {selected === "collections" && <form method="post" action="/api/admin/platform/starter-packs" className="mb-6 flex flex-wrap items-center gap-4 rounded-2 border border-line bg-bg-2 p-4">
      <div className="min-w-0 flex-1 text-sm"><p className="font-medium">Starter groups</p>
        <p className="text-ink-soft">Creates the five groups and the complete set from your products, matched by name. Existing ones are not changed. To sell a group as one product, open it and click Create pack product.</p></div>
      <button type="submit" className="btn btn-primary"><Plus size={16} aria-hidden />Create starter packs</button></form>}
    <details className="mb-8 border-y border-line py-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Plus size={16} aria-hidden />New {section === "collections" ? "collection" : section === "authors" ? "developer" : section === "testimonials" ? "testimonial" : section === "media" ? "media item" : "module"}</summary><div className="pt-5"><Editor section={selected} record={selected === "modules" && type ? { type } : {}} {...options} /></div></details>
    {!records.length && <p className="text-sm text-ink-soft">No {section === "authors" ? "developers" : section} yet.</p>}
    {records.map(record => <section key={String(record.id ?? record.slug)} className="mb-8 border-b border-line pb-8"><h2 className="mb-4 break-words text-lg font-medium">{String(record.title)}</h2><Editor section={selected} record={record} {...options} />
      {selected === "collections" && <PackProduct slug={String(record.slug)} count={Array.isArray(record.book_slugs) ? (record.book_slugs as string[]).length : 0} product={packProducts.get(String(record.slug))} />}</section>)}
  </section>;
}
// A collection sold as one product: priced at its add-ons' total less the pack percent, delivered as one ZIP of their files.
function PackProduct({ slug, count, product }: { slug: string; count: number; product?: { slug: string; price_inr: number; sale_price_inr: number | null; release_approved: boolean; active: boolean } }) {
  const price = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;
  const live = product && product.release_approved && product.active;
  return <form method="post" action="/api/admin/platform/pack-product" className="mt-4 flex flex-wrap items-center gap-4 rounded-2 border border-line bg-bg-2 p-4">
    <input type="hidden" name="slug" value={slug} />
    <div className="min-w-0 flex-1 text-sm">
      <p className="font-medium">Sell as one product</p>
      <p className="text-ink-soft">{product
        ? <>Pack product {live ? "on sale" : "not on sale"} at {price(product.sale_price_inr ?? product.price_inr)}{product.sale_price_inr ? <> (was {price(product.price_inr)})</> : null}. <Link className="underline" href={`/admin/products/${encodeURIComponent(slug)}`}>Open it in Products</Link>. Rebuild after any add-on changes.</>
        : <>One product at the total of its {count} add-ons less {STORE.packDiscountPercent}%. Customers get one download with all the files.</>}</p></div>
    <button type="submit" className="btn btn-primary" disabled={count < 2}>{product ? "Rebuild pack product" : "Create pack product"}</button>
  </form>;
}

function Editor({ section, record = {}, books, collections, authors, categories }: { section: ContentSection; record?: Record<string, unknown>; books: PickerBook[]; collections: { slug: string; title: string }[]; authors: { id: string; name: string }[]; categories: { slug: string; name: string }[] }) {
  const id = String(record.id ?? record.slug ?? "");
  const field = (name: string, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="text-sm">{label}<input name={name} className="field-input mt-1" defaultValue={String(record[name] ?? "")} {...extra} /></label>;
  const isModule = !["collections", "authors"].includes(section);
  return <ActionForm key={`${id}:${String(record.updated_at ?? "new")}`} action="/api/admin/platform/content">
    <input type="hidden" name="section" value={section} /><input type="hidden" name="id" value={id} /><input type="hidden" name="updated_at" value={record.updated_at instanceof Date ? record.updated_at.toISOString() : String(record.updated_at ?? "")} />
    <div className="grid gap-4 sm:grid-cols-2">
      {section === "collections"
        ? <TitleAndSlug title={String(record.title ?? "")} slug={String(record.slug ?? "")} locked={Boolean(id)} />
        : field("title", section === "authors" ? "Name" : "Title", { required: true, maxLength: 200 })}
      {isModule && <ModuleFields key={String(record.updated_at ?? "new")} section={section} type={String(record.type ?? (section === "testimonials" ? "testimonial" : section === "media" ? "media" : "text"))} payload={(record.payload ?? {}) as Record<string, unknown>} collections={collections} authors={authors} categories={categories} />}
      {field("image_url", section === "authors" ? "Logo or photo URL" : "Image URL", { maxLength: 2000 })}
      {isModule && field("mobile_image_url", "Mobile image URL", { maxLength: 2000 })}
      {isModule && field("link_url", "Link URL", { maxLength: 2000 })}
      {isModule && field("link_label", "Link label", { maxLength: 100 })}
    </div>
    <label className="text-sm">{section === "authors" ? "About the developer" : section === "testimonials" ? "Quote" : section === "collections" ? "One-line pitch (shown under the pack name)" : "Copy"}<textarea name="body" className="field-input mt-1" rows={4} maxLength={20000} defaultValue={String(record.body ?? (record.payload as Record<string, unknown> | undefined)?.quote ?? "")} /></label>
    {section === "collections" && <BookPicker books={books} selected={Array.isArray(record.book_slugs) ? record.book_slugs as string[] : []} />}
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="text-sm">Status<select name="status" className="field-input mt-1" defaultValue={String(record.status ?? "draft")}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
      {field("publish_at", "Publish at (with timezone)", { placeholder: "2026-10-10T12:00:00+05:30", maxLength: 40 })}
      {isModule && field("ends_at", "Ends at (with timezone)", { placeholder: "2026-10-20T00:00:00+05:30", maxLength: 40 })}
      {section !== "authors" && field("sort", "Sort order", { type: "number", min: -100000, max: 100000, step: 1 })}
    </div>
    <div className="flex flex-wrap gap-3"><button name="action" value="save" type="submit" className="btn btn-primary"><Save size={16} aria-hidden />Save</button>{id && <><Link href={`/admin/platform/preview?section=${section}&id=${encodeURIComponent(id)}`} className="btn btn-ghost" target="_blank" rel="noopener noreferrer"><Eye size={16} aria-hidden />Preview saved</Link><button name="action" value="delete" type="submit" formNoValidate className="btn btn-ghost"><Trash2 size={16} aria-hidden />Delete</button></>}</div>
  </ActionForm>;
}
