import type { Offer } from "./offers";

// A pack (collection) is sold as one purchase: when the cart holds every product in it, the whole set is the percent off.
// These offers are built from the published collections at read time, so there is nothing to set up per pack and a pack's
// price follows its products. They are never saved as offers: see isPackOffer (badges and redemptions skip them).
export const PACK_PREFIX = "pack:";
export const isPackOffer = (offer: { id: string }) => offer.id.startsWith(PACK_PREFIX);

export function packOffers(packs: { slug: string; title: string; book_slugs: string[] }[], percent: number): Offer[] {
  if (!(percent > 0 && percent <= 90)) return [];
  return packs.filter((p) => Array.isArray(p.book_slugs) && p.book_slugs.length >= 2).map((p) => ({
    id: `${PACK_PREFIX}${p.slug}`, name: `${p.title}: ${percent}% off the pack`, kind: "percent", scope: "books", targets: [...p.book_slugs], value: percent,
    cap: null, buy_qty: null, get_qty: null, get_percent: null, bundle_qty: null, bundle_price: null,
    // Every product in the pack must be in the cart.
    min_items: p.book_slugs.length, min_subtotal: 0, code: null, combinable: false, first_order_only: false, usage_limit: null, per_customer_limit: null,
    priority: 0, starts_at: null, ends_at: null, status: "active", uses: 0, created_at: "2000-01-01T00:00:00.000Z",
  }));
}
