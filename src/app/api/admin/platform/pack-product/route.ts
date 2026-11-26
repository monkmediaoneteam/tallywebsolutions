import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { sql } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { readLimitedForm } from "@/lib/submissions";
import { booksDocs, pathsBefore, releaseQuietly } from "@/lib/storage-admin";
import { MAX_UPLOAD_BYTES, SaleError, isPrivateBlobUrl, putOnSale, recordBookFile } from "@/lib/admin-sale";
import { FILE_TYPES, normaliseFileType } from "@/lib/file-types";
import { STORE } from "@/lib/store";
import { buildPackZip, packDescription, packPrice } from "@/lib/pack-product";

export const runtime = "nodejs";
export const maxDuration = 60;

type Row = { slug: string; title: string; price_inr: number; file_url: string | null; file_format: string | null; facts: Record<string, unknown> | null };

// The product file's bytes, from private storage or from the files shipped with the site.
async function readProductFile(url: string): Promise<Uint8Array> {
  if (url.startsWith("private:")) {
    const file = url.slice(8);
    if (!/^[^\\/:]+$/.test(file) || file === "." || file === "..") throw new SaleError("A product file name is invalid.");
    return new Uint8Array(await readFile(path.join(process.cwd(), "private", "books", file)));
  }
  if (isPrivateBlobUrl(url) && process.env.BLOB_READ_WRITE_TOKEN) {
    const result = await get(url, { access: "private", useCache: false, abortSignal: AbortSignal.timeout(30000) });
    if (!result || result.statusCode !== 200) throw new SaleError("A product file could not be read from storage.", 502);
    const chunks: Uint8Array[] = []; let size = 0;
    const reader = result.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES) throw new SaleError("A product file is larger than 5 MB.", 413);
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks));
  }
  throw new SaleError("A product file is stored somewhere the pack builder cannot read.", 409);
}

// The name a product's file has inside the ZIP: the uploaded file's own name, else "<title>.<type>".
function entryName(b: Row): string {
  const own = typeof b.facts?._file_name === "string" ? b.facts._file_name : "";
  if (own) return own;
  const type = normaliseFileType(String(b.facts?._file_type ?? b.file_format ?? "").toLowerCase()) ?? "tdl";
  return `${b.title}.${FILE_TYPES[type].extensions[0]}`;
}

// Builds (or rebuilds) the pack's own product from a collection: one product at the add-ons' total less the pack percent,
// whose download is a ZIP of all their files. Safe to run again after a product changes: the same product is updated in place.
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin rejected." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  const back = (query: string) => NextResponse.redirect(new URL(`/admin/platform/collections?${query}`, req.url), 303);
  try {
    const form = await readLimitedForm(req, 4000);
    const slug = String(form.get("slug") ?? "");
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw new SaleError("File storage is not set up yet. Connect a private Vercel Blob store to this project.", 503);
    const collection = (await sql`select slug, title, book_slugs from content_collections where slug = ${slug}`)[0] as { slug: string; title: string; book_slugs: string[] } | undefined;
    if (!collection) throw new SaleError("Collection not found.", 404);
    const wanted = Array.isArray(collection.book_slugs) ? collection.book_slugs : [];
    if (wanted.length < 2) throw new SaleError("Add at least two products to the collection first.");
    const rows = await sql`select slug, title, price_inr, file_url, file_format, facts from books
      where slug in (select jsonb_array_elements_text(${JSON.stringify(wanted)}::jsonb)) and not coalesce(third_party, false)` as Row[];
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    const books = wanted.map((s) => bySlug.get(s)).filter((b): b is Row => Boolean(b));
    const noFile = books.filter((b) => !b.file_url || !(b.price_inr > 0));
    if (noFile.length) throw new SaleError(`These products need a file and a price first: ${noFile.map((b) => b.title).join(", ")}.`, 409);

    // The pack product keeps the collection's address; an unrelated product with that address is never overwritten.
    const existing = (await sql`select facts->>'_pack_of' as pack_of, file_url from books where slug = ${slug}`)[0] as { pack_of: string | null; file_url: string | null } | undefined;
    if (existing && existing.pack_of !== slug) throw new SaleError("A product with this web address already exists. Change the collection's title or web address.", 409);

    const files = [];
    for (const b of books) files.push({ name: entryName(b), bytes: await readProductFile(b.file_url!) });
    const zip = Buffer.from(buildPackZip(files));
    if (zip.length > MAX_UPLOAD_BYTES) throw new SaleError("The pack is larger than 5 MB. Split it into two packs.", 413);

    const total = books.reduce((s, b) => s + b.price_inr, 0);
    const price = packPrice(total, STORE.packDiscountPercent);
    const titles = books.map((b) => b.title);
    await sql`insert into books(slug, title, price_inr, active, release_approved) values (${slug}, ${collection.title}, 0, false, false) on conflict (slug) do nothing`;
    await sql`update books set title = ${collection.title}, description = ${packDescription(books.length, STORE.packDiscountPercent)},
        long_description = ${`Includes:\n\n${titles.map((t) => `• ${t}`).join("\n")}`}, highlights = ${JSON.stringify(titles)}::jsonb,
        price_inr = ${total}, sale_price_inr = ${price < total ? price : null}, sale_starts_at = null, sale_ends_at = null,
        facts = coalesce(facts, '{}'::jsonb) || jsonb_build_object('_pack_of', ${slug}::text, '_pack_count', ${books.length}::int)
      where slug = ${slug} and not coalesce(third_party, false)`;

    const hasFile = Boolean(existing?.file_url);
    const pathname = `admin/books/${slug}/${randomUUID()}-pdf`;
    const blob = await put(pathname, zip, { access: "private", token, contentType: FILE_TYPES.zip.contentType, addRandomSuffix: false, allowOverwrite: false });
    const before = hasFile ? await pathsBefore(booksDocs([slug])) : [];
    await recordBookFile(sql, { slug, url: blob.url, bytes: zip, pathname, fileType: "zip", name: `${slug}.zip`, replace: hasFile });
    await sql`update books set active = true where slug = ${slug}`;
    await putOnSale(sql, { slug, root: process.cwd() });
    if (before.length) await releaseQuietly(before.filter((p) => p !== pathname));
    for (const p of ["/", "/admin/products", `/admin/products/${slug}`, `/products/${slug}`, `/collections/${slug}`, "/collections", "/search"]) revalidatePath(p);
    return back(`pack=${encodeURIComponent(slug)}&count=${books.length}`);
  } catch (error) {
    if (error instanceof SaleError) return back(`packerror=${encodeURIComponent(error.message)}`);
    console.error("[pack product] failed");
    return back(`packerror=${encodeURIComponent("The pack product could not be built. Try again.")}`);
  }
}
