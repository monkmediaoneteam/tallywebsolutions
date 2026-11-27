import type { Book } from "./db";
import { currentPrice } from "./money";
import { saleable } from "./access-policy";
import { STORE } from "./store";
import { plainText } from "./rich-text";

// A bundle is a collection sold as ONE product. It lives in the collection: the title, description, image and the products
// inside are all managed there, and its price is the products' total less the bundle percent, worked out when it is read.
// It is one line in the cart; checkout splits that one line into its products, so each keeps its own file and download.
// A small "anchor" row in `books` (facts._bundle_of = the collection's web address) lets the cart, search and product page treat it like any product.

export const BUNDLE_FILE_PREFIX = "bundle:";
type HasFacts = { facts?: Record<string, string> | null };
// `_pack_of` is the name an earlier version used for the same thing, so packs already built become live bundles without any action.
export const bundleSlugOf = (book: HasFacts & { facts?: Record<string, string> | null }): string | null => {
  const v = book.facts?._bundle_of || book.facts?._pack_of;
  return typeof v === "string" && v ? v : null;
};
export const isBundle = (book: HasFacts) => bundleSlugOf(book) !== null;

export type BundleCollection = { slug: string; title: string; description: string | null; image_url: string | null; book_slugs: string[]; status: string; publish_at: string | null };

/** The bundle's price in paise: the total less the percent, in whole rupees, never below ₹1 and never above the total. */
export function bundlePrice(total: number, percent: number): number {
  if (!(total > 0)) return 0;
  const off = Math.round((total * (100 - Math.min(90, Math.max(0, percent)))) / 100 / 100) * 100;
  return Math.max(100, Math.min(total, off));
}

/** Splits `amount` (paise) in proportion to `weights`, in whole paise that add up exactly; the leftover goes to the heaviest. */
export function allocate(amount: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!(sum > 0) || !(amount > 0)) return weights.map(() => 0);
  const out = weights.map((w) => Number((BigInt(amount) * BigInt(w)) / BigInt(sum)));
  out[weights.indexOf(Math.max(...weights))] += amount - out.reduce((s, v) => s + v, 0);
  return out;
}

/** The products inside a bundle that can be bought today, in the collection's order. A bundle never contains another bundle. */
export function liveParts(collection: BundleCollection, pool: Book[]): Book[] {
  const bySlug = new Map(pool.map((b) => [b.slug, b]));
  return (Array.isArray(collection.book_slugs) ? collection.book_slugs : []).map((s) => bySlug.get(s))
    .filter((b): b is Book => !!b && !isBundle(b) && b.facts?._demo !== "true" && saleable(b));
}

/**
 * The bundle as the store sees it: the anchor row filled in from its collection. Hidden unless the collection is published and
 * at least two of its products can be bought. `file_url` is a marker only: a bundle has no file of its own, and checkout never
 * delivers it (it delivers the products inside).
 */
export function overlayBundle(row: Book, collection: BundleCollection | undefined, pool: Book[], now: Date, percent: number = STORE.packDiscountPercent): Book {
  const parts = collection ? liveParts(collection, pool) : [];
  const published = !!collection && collection.status === "published" && (!collection.publish_at || Date.parse(collection.publish_at) <= now.getTime());
  // "Sell as one bundle" switched off in admin (the anchor row is inactive), or nothing to sell: hidden everywhere.
  if (!row.active || !collection || !published || parts.length < 2) return { ...row, active: false };
  const regular = parts.reduce((s, b) => s + b.price_inr, 0);
  const current = parts.reduce((s, b) => s + currentPrice(b, now).price, 0);
  const price = bundlePrice(current, percent);
  const names = parts.map((b) => b.title);
  return {
    ...row, title: collection.title, description: collection.description ? plainText(collection.description).slice(0, 300) : null, long_description: collection.description,
    highlights: names, cover: collection.image_url ?? row.cover, price_inr: regular, sale_price_inr: price > 0 && price < regular ? price : null,
    sale_starts_at: null, sale_ends_at: null, file_url: `${BUNDLE_FILE_PREFIX}${collection.slug}`, file_format: "Bundle", file_size: `${parts.length} add-ons`,
    release_approved: true, scan_status: "clean", active: true, third_party: false,
  };
}
