import { notFound, redirect } from "next/navigation";
import { Save, Trash2, Plus, Eye, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { isAdmin } from "@/lib/admin-auth";
import { sql, getBook } from "@/lib/db";
import { contentSections, ensureBundleRows, getAdminContent, type ContentSection } from "@/lib/content";
import { bundleConfig } from "@/lib/bundles";
import { currentPrice } from "@/lib/money";
import ActionForm from "@/components/ActionForm";
import ModuleFields from "../ModuleFields";
import BookPicker, { type PickerBook } from "../BookPicker";
import TitleAndSlug from "../TitleAndSlug";
import RichTextField from "../RichTextField";
import ImageField from "@/components/ImageField";
import { STORE } from "@/lib/store";

export default async function ContentPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ type?: string; saved?: string; packs?: string; missing?: string; edit?: string; new?: string; q?: string; page?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { section } = await params;
  if (!contentSections.includes(section as ContentSection)) notFound();
  const selected = section as ContentSection;
  const { type, saved, packs, missing, edit, new: isNew, q: search = "", page = "1" } = await searchParams;
  // Every bundle has its own product row (its price rules live there); older bundles and the starter ones get theirs here.
  if (selected === "collections") await ensureBundleRows();
  const anchors = new Map((selected === "collections" ? await sql`select slug, facts from books where coalesce(facts->>'_bundle_of', facts->>'_pack_of') is not null` as { slug: string; facts: Record<string, string> }[] : []).map((p) => [p.slug, p.facts]));
  const records = (await getAdminContent(selected)).filter(record => !(selected === "modules" && type) || record.type === type);
  const books = selected === "collections" ? (await sql`select b.slug, b.title, b.cover, b.price_inr, b.sale_price_inr, b.sale_starts_at, b.sale_ends_at, c.name as category from books b left join categories c on c.slug = b.category_slug where coalesce(b.facts->>'_bundle_of', b.facts->>'_pack_of', '') = '' order by b.title` as { slug: string; title: string; cover: string | null; price_inr: number; sale_price_inr: number | null; sale_starts_at: string | null; sale_ends_at: string | null; category: string | null }[])
    .map(({ price_inr, sale_price_inr, sale_starts_at, sale_ends_at, ...b }) => ({ ...b, price: currentPrice({ price_inr, sale_price_inr, sale_starts_at, sale_ends_at }).price })) : [];
  const collections = selected === "modules" ? await sql`select slug,title from content_collections order by title` as { slug: string; title: string }[] : [];
  const authors = selected === "modules" ? await sql`select id,name from author_profiles order by name` as { id: string; name: string }[] : [];
  const categories = selected === "modules" ? await sql`select slug,name from categories order by sort,name` as { slug: string; name: string }[] : [];
  const options = { books, collections, authors, categories, anchors };
  if (selected === "collections") {
    const editing = edit ? records.find((r) => String(r.slug) === edit) : undefined;
    const saved_ = saved && <p className="mb-6 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The store is updated.</p>;
    // One bundle's form is its own screen, so the list stays short however many bundles there are.
    if (isNew === "1" || edit) return <section>
      <Link href="/admin/platform/collections" className="mb-5 inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink"><ArrowLeft size={16} aria-hidden />All bundles</Link>
      {edit && !editing ? <p className="text-sm text-ink-soft">That bundle no longer exists.</p>
        : <><h2 className="mb-4 break-words text-lg font-medium">{editing ? String(editing.title) : "New bundle"}</h2><Editor section={selected} record={editing ?? {}} {...options} /></>}
    </section>;
    const needle = search.trim().toLowerCase().slice(0, 80);
    const matches = records.filter((r) => !needle || String(r.title).toLowerCase().includes(needle) || String(r.slug).toLowerCase().includes(needle));
    const PAGE = 15, pages = Math.max(1, Math.ceil(matches.length / PAGE)), current = Math.min(pages, Math.max(1, Number.parseInt(page, 10) || 1));
    const shown = matches.slice((current - 1) * PAGE, current * PAGE);
    // What each bundle on this page sells for right now, as the store reads it.
    const priced = new Map(await Promise.all(shown.map(async (r) => [String(r.slug), await getBook(String(r.slug))] as const)));
    const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", paise % 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;
    const href = (n: number) => `/admin/platform/collections?${new URLSearchParams({ ...(needle ? { q: needle } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`;
    return <section>
      {saved_}
      {packs !== undefined && <p className="mb-6 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">
        {Number(packs) > 0 ? `Created ${packs} bundle${packs === "1" ? "" : "s"}.` : "The starter bundles already exist; nothing was changed."}
        {Number(missing) > 0 && ` ${missing} add-on title${missing === "1" ? "" : "s"} from your list ${missing === "1" ? "was" : "were"} not found in Products, so those are left out until you add them.`}</p>}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form method="get" role="search" className="flex min-w-0 flex-1 items-center gap-2">
          <label className="sr-only" htmlFor="collection-search">Search bundles</label>
          <input id="collection-search" name="q" defaultValue={search} placeholder="Search by name or web address" className="field-input max-w-sm flex-1" />
          <button className="btn btn-ghost" type="submit">Search</button>
        </form>
        <Link href="/admin/platform/collections?new=1" className="btn btn-primary"><Plus size={16} aria-hidden />New bundle</Link>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-bg-2 text-xs uppercase tracking-wide text-ink-soft"><tr>
            <th className="p-3 font-medium">Bundle</th><th className="p-3 font-medium">TDLs</th><th className="p-3 font-medium">Price</th><th className="p-3 font-medium">Status</th></tr></thead>
          <tbody>{shown.map((r) => { const slug = String(r.slug), book = priced.get(slug);
            return <tr key={slug} className="border-b border-line last:border-0 hover:bg-bg-2">
              <td className="p-3"><Link href={`/admin/platform/collections?edit=${encodeURIComponent(slug)}`} className="font-medium text-brand hover:underline">{String(r.title)}</Link><span className="block text-xs text-ink-mute">{slug}</span></td>
              <td className="p-3">{Array.isArray(r.book_slugs) ? (r.book_slugs as string[]).length : 0}</td>
              <td className="p-3">{book?.active ? <>{inr(book.sale_price_inr ?? book.price_inr)}{book.sale_price_inr ? <span className="ml-2 text-xs text-ink-mute line-through">{inr(book.price_inr)}</span> : null}</> : <span className="text-ink-mute">Not for sale yet</span>}</td>
              <td className="p-3 capitalize">{String(r.status)}</td></tr>; })}</tbody></table>
        {!shown.length && <p className="p-8 text-center text-sm text-ink-soft">{records.length ? "No bundles match this search." : "No bundles yet. Create one, or create the starter bundles below."}</p>}
      </div>
      {pages > 1 && <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
        {current > 1 ? <Link className="btn btn-ghost" href={href(current - 1)}>Previous</Link> : <span />}
        <span className="text-ink-soft">Page {current} of {pages} · {matches.length} bundles</span>
        {current < pages ? <Link className="btn btn-ghost" href={href(current + 1)}>Next</Link> : <span />}
      </nav>}
      <form method="post" action="/api/admin/platform/starter-packs" className="mt-8 flex flex-wrap items-center gap-4 rounded-2 border border-line bg-bg-2 p-4">
        <div className="min-w-0 flex-1 text-sm"><p className="font-medium">Starter bundles</p>
          <p className="text-ink-soft">Creates the five bundles and the complete one from your products, matched by name, at {STORE.packDiscountPercent}% off. Existing bundles are not changed. Open any bundle to change its TDLs, words, image and price.</p></div>
        <button type="submit" className="btn btn-ghost"><Plus size={16} aria-hidden />Create starter bundles</button></form>
    </section>;
  }
  return <section>
    {saved && <p className="mb-6 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The store is updated.</p>}
    <details className="mb-8 border-y border-line py-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Plus size={16} aria-hidden />New {section === "authors" ? "developer" : section === "testimonials" ? "testimonial" : section === "media" ? "media item" : "module"}</summary><div className="pt-5"><Editor section={selected} record={selected === "modules" && type ? { type } : {}} {...options} /></div></details>
    {!records.length && <p className="text-sm text-ink-soft">No {section === "authors" ? "developers" : section} yet.</p>}
    {records.map(record => <section key={String(record.id ?? record.slug)} className="mb-8 border-b border-line pb-8"><h2 className="mb-4 break-words text-lg font-medium">{String(record.title)}</h2><Editor section={selected} record={record} {...options} /></section>)}
  </section>;
}

function Editor({ section, record = {}, books, collections, authors, categories, anchors }: { section: ContentSection; record?: Record<string, unknown>; anchors: Map<string, Record<string, string>>; books: PickerBook[]; collections: { slug: string; title: string }[]; authors: { id: string; name: string }[]; categories: { slug: string; name: string }[] }) {
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
      <div className="sm:col-span-2 sm:max-w-md"><ImageField name="image_url" value={String(record.image_url ?? "")}
        label={section === "authors" ? "Logo or photo" : section === "collections" ? "Bundle image" : "Image"}
        ratio={section === "authors" ? "1 / 1" : "4 / 3"} crop={section === "collections" || section === "authors"} expect={section === "authors" ? { width: 400, height: 400 } : section === "collections" ? { width: 1200, height: 900 } : undefined}
        hint={section === "collections" ? "Shown on the bundle's page and in the store (4:3, about 1200 × 900). JPEG, PNG or WebP, up to 5 MB." : undefined} /></div>
      {isModule && <div className="sm:col-span-2 sm:max-w-md"><ImageField name="mobile_image_url" label="Mobile image (optional)" value={String(record.mobile_image_url ?? "")} ratio="4 / 5" /></div>}
      {isModule && field("link_url", "Link URL", { maxLength: 2000 })}
      {isModule && field("link_label", "Link label", { maxLength: 100 })}
    </div>
    {section === "collections"
      ? <RichTextField name="body" label="Description (shown on the bundle's page)" value={String(record.body ?? "")} />
      : <label className="text-sm">{section === "authors" ? "About the developer" : section === "testimonials" ? "Quote" : "Copy"}<textarea name="body" className="field-input mt-1" rows={4} maxLength={20000} defaultValue={String(record.body ?? (record.payload as Record<string, unknown> | undefined)?.quote ?? "")} /></label>}
    {section === "collections" && <BookPicker books={books} selected={Array.isArray(record.book_slugs) ? record.book_slugs as string[] : []} pricing={bundleConfig({ facts: anchors.get(id) })} />}
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="text-sm">Status<select name="status" className="field-input mt-1" defaultValue={String(record.status ?? "draft")}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
      {field("publish_at", "Publish at (with timezone)", { placeholder: "2026-10-10T12:00:00+05:30", maxLength: 40 })}
      {isModule && field("ends_at", "Ends at (with timezone)", { placeholder: "2026-10-20T00:00:00+05:30", maxLength: 40 })}
      {section !== "authors" && field("sort", "Sort order", { type: "number", min: -100000, max: 100000, step: 1 })}
    </div>
    <div className="flex flex-wrap gap-3"><button name="action" value="save" type="submit" className="btn btn-primary"><Save size={16} aria-hidden />Save</button>{id && <><Link href={`/admin/platform/preview?section=${section}&id=${encodeURIComponent(id)}`} className="btn btn-ghost" target="_blank" rel="noopener noreferrer"><Eye size={16} aria-hidden />Preview saved</Link><button name="action" value="delete" type="submit" formNoValidate className="btn btn-ghost"><Trash2 size={16} aria-hidden />Delete</button></>}</div>
  </ActionForm>;
}
