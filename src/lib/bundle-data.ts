import { sql, type Book } from "./db";
import { bundleSlugOf, liveParts, type BundleCollection } from "./bundles";

/** For each bundle among `books`, the products inside it that can be bought right now, in the collection's order. */
export async function bundleParts(books: Book[]): Promise<Map<string, Book[]>> {
  const out = new Map<string, Book[]>();
  const bundles = books.filter((b) => bundleSlugOf(b));
  if (!bundles.length) return out;
  const collections = await sql`select slug, title, description, image_url, status, to_json(publish_at)#>>'{}' as publish_at, book_slugs from content_collections
    where slug in (select jsonb_array_elements_text(${JSON.stringify(bundles.map((b) => bundleSlugOf(b)))}::jsonb))` as BundleCollection[];
  const wanted = [...new Set(collections.flatMap((c) => (Array.isArray(c.book_slugs) ? c.book_slugs : [])))];
  const pool = wanted.length ? await sql`select * from books where slug in (select jsonb_array_elements_text(${JSON.stringify(wanted)}::jsonb))` as Book[] : [];
  for (const b of bundles) {
    const collection = collections.find((c) => c.slug === bundleSlugOf(b));
    out.set(b.slug, collection ? liveParts(collection, pool) : []);
  }
  return out;
}
