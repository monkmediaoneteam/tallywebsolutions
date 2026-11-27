import type { Book } from "./db";
import { currentPrice } from "./money";
import { saleable } from "./access-policy";
import { STORE } from "./store";
import { plainText } from "./rich-text";
import { FILE_TYPES, normaliseFileType } from "./file-types";

// A BUNDLE is one product that sells several TDLs together. It has its own price (the TDLs' total less a discount, or an exact
// price you set) and the customer downloads one ZIP holding all of them. It is managed in Admin > Bundles: its name, description,
// image, the TDLs inside and its price all live there. It is stored as a row in content_collections (what it contains) plus a small
// "anchor" row in `books` (facts._bundle_of) so the cart, search, product page and checkout treat it like any product.

export const BUNDLE_FILE_PREFIX = "bundle:";
type HasFacts = { facts?: Record<string, string> | null };
// `_pack_of` is the name an earlier version used for the same thing, so bundles already built keep working.
export const bundleSlugOf = (book: HasFacts): string | null => {
  const v = book.facts?._bundle_of || book.facts?._pack_of;
  return typeof v === "string" && v ? v : null;
};
export const isBundle = (book: HasFacts) => bundleSlugOf(book) !== null;

export type BundleCollection = { slug: string; title: string; description: string | null; image_url: string | null; book_slugs: string[]; status: string; publish_at: string | null };

/** This bundle's price rules, kept on its anchor row: a discount percent, and optionally an exact price (paise) that wins over it. */
export function bundleConfig(book: HasFacts, fallbackPercent: number = STORE.packDiscountPercent): { percent: number; fixed: number | null } {
  const p = Number(book.facts?._bundle_discount), f = Number(book.facts?._bundle_price);
  return { percent: Number.isInteger(p) && p >= 0 && p <= 90 ? p : fallbackPercent, fixed: Number.isSafeInteger(f) && f > 0 ? f : null };
}

/** The price in paise: an exact price if one is set and it really is a saving, else the total less the percent in whole rupees (never below ₹1). */
export function bundlePrice(total: number, percent: number, fixed: number | null = null): number {
  if (!(total > 0)) return 0;
  if (fixed && fixed < total) return fixed;
  const off = Math.round((total * (100 - Math.min(90, Math.max(0, percent)))) / 100 / 100) * 100;
  return Math.max(100, Math.min(total, off));
}

/** The products inside a bundle that can be bought today, in the bundle's order. A bundle never contains another bundle. */
export function liveParts(collection: BundleCollection, pool: Book[]): Book[] {
  const bySlug = new Map(pool.map((b) => [b.slug, b]));
  return (Array.isArray(collection.book_slugs) ? collection.book_slugs : []).map((s) => bySlug.get(s))
    .filter((b): b is Book => !!b && !isBundle(b) && b.facts?._demo !== "true" && saleable(b));
}

/** The name a product's file has inside the bundle's ZIP: the uploaded file's own name, else "<title>.<type>". */
export function partFileName(b: Pick<Book, "title" | "file_format" | "facts">): string {
  const own = typeof b.facts?._file_name === "string" ? b.facts._file_name : "";
  if (own) return own;
  const type = normaliseFileType(String(b.facts?._file_type ?? b.file_format ?? "").toLowerCase()) ?? "tdl";
  return `${b.title}.${FILE_TYPES[type].extensions[0]}`;
}

/**
 * The bundle as the store sees it: the anchor row filled in from its bundle. Hidden unless it is published, switched on and at least
 * two of its products can be bought. `file_url` is a marker only: a bundle has no file of its own; the download is made from the
 * files of the products inside, when it is downloaded.
 */
export function overlayBundle(row: Book, collection: BundleCollection | undefined, pool: Book[], now: Date, fallbackPercent: number = STORE.packDiscountPercent): Book {
  const parts = collection ? liveParts(collection, pool) : [];
  const published = !!collection && collection.status === "published" && (!collection.publish_at || Date.parse(collection.publish_at) <= now.getTime());
  if (!row.active || !collection || !published || parts.length < 2) return { ...row, active: false };
  const { percent, fixed } = bundleConfig(row, fallbackPercent);
  const regular = parts.reduce((s, b) => s + b.price_inr, 0);
  const current = parts.reduce((s, b) => s + currentPrice(b, now).price, 0);
  const price = bundlePrice(current, percent, fixed);
  return {
    ...row, title: collection.title, description: collection.description ? plainText(collection.description).slice(0, 300) : null, long_description: collection.description,
    highlights: parts.map((b) => b.title), cover: collection.image_url ?? row.cover, price_inr: regular, sale_price_inr: price > 0 && price < regular ? price : null,
    sale_starts_at: null, sale_ends_at: null, file_url: `${BUNDLE_FILE_PREFIX}${collection.slug}`, file_format: "ZIP", file_size: `${parts.length} TDLs`,
    release_approved: true, scan_status: "clean", active: true, third_party: false,
  };
}
