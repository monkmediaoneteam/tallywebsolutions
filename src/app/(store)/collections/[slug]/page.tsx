import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicContent } from "@/lib/content";
import { flag } from "@/lib/env";
import { getStoreBooks } from "@/lib/store-data";
import BookCard from "@/components/BookCard";
import { priceCart } from "@/lib/offers";
import { packOffers } from "@/lib/packs";
import { rupees } from "@/lib/money";
import { STORE } from "@/lib/store";
import AddPack from "./AddPack";

export const dynamic = "force-dynamic";

// A pack lists its products in the order the admin set. Products that are not on sale are left out.
async function load(slug: string) {
  const [{ collections }, books] = await Promise.all([getPublicContent(), getStoreBooks(new Date())]);
  const collection = collections.find((c) => c.slug === slug);
  if (!collection) return null;
  const bySlug = new Map(books.map((b) => [b.slug, b]));
  const items = collection.book_slugs.map((s) => bySlug.get(s)).filter((b): b is (typeof books)[number] => Boolean(b));
  return { collection, items };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const found = await load((await params).slug);
  if (!found) return { title: "Pack not found", robots: { index: false } };
  return { title: found.collection.title, description: found.collection.description ?? undefined };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { collection, items } = found;
  const enabled = flag("COMMERCE_ENABLED");
  // The pack price is what the cart charges when every product of the pack is in it (see packs.ts), worked out by the same pricing.
  const percent = STORE.packDiscountPercent;
  const pack = items.length >= 2 ? priceCart(items.map((b) => ({ slug: b.slug, price: b.price, regular: b.regular, categories: [], collections: [] })),
    packOffers([{ slug: collection.slug, title: collection.title, book_slugs: items.map((b) => b.slug) }], percent), { now: new Date() }) : null;
  return <div className="wrap section collection-page">
    <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{collection.title}</span></nav>
    <header className="pack-head">
      <p className="eyebrow">Pack · {items.length} {items.length === 1 ? "TDL" : "TDLs"}</p>
      <h1>{collection.title}</h1>
      {collection.description && <p className="pack-lede">{collection.description}</p>}
    </header>
    {pack && pack.discount > 0 && <div className="pack-buy surface">
      <div className="pack-buy-text">
        <p className="pack-buy-label">Buy the whole pack</p>
        <p className="pack-buy-price"><span className="price">{rupees(pack.total)}</span> <s className="pack-buy-was">{rupees(pack.subtotal)}</s> <span className="pill-offer">{percent}% off</span></p>
        <p className="pack-buy-note">All {items.length} add-ons together. You save {rupees(pack.discount)}. Buy fewer and each is its own price.</p>
      </div>
      <AddPack slugs={items.map((b) => b.slug)} enabled={enabled} />
    </div>}
    {items.length > 0
      ? <ul className="pack-grid">{items.map((b) => <li key={b.slug}><BookCard book={b} enabled={enabled} /></li>)}</ul>
      : <p className="notice">No products in this pack are on sale yet.</p>}
  </div>;
}
