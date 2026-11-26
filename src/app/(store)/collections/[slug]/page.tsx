import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicContent } from "@/lib/content";
import { flag } from "@/lib/env";
import { getStoreBooks } from "@/lib/store-data";
import BookCard from "@/components/BookCard";
import AddToCart from "@/components/AddToCart";
import BuyNow from "@/components/BuyNow";
import Price from "@/components/Price";

export const dynamic = "force-dynamic";

// A pack lists its products in the order the admin set. Products that are not on sale are left out.
async function load(slug: string) {
  const [{ collections }, books] = await Promise.all([getPublicContent(), getStoreBooks(new Date())]);
  const collection = collections.find((c) => c.slug === slug);
  if (!collection) return null;
  const bySlug = new Map(books.map((b) => [b.slug, b]));
  const items = collection.book_slugs.map((s) => bySlug.get(s)).filter((b): b is (typeof books)[number] => Boolean(b));
  // The pack's own product (built in admin), when it is on sale: the one thing to buy.
  const pack = bySlug.get(collection.slug) ?? null;
  return { collection, items, pack };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const found = await load((await params).slug);
  if (!found) return { title: "Pack not found", robots: { index: false } };
  return { title: found.collection.title, description: found.collection.description ?? undefined };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { collection, items, pack } = found;
  const enabled = flag("COMMERCE_ENABLED");
  return <div className="wrap section collection-page">
    <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{collection.title}</span></nav>
    <header className="pack-head">
      <p className="eyebrow">Pack · {items.length} {items.length === 1 ? "TDL" : "TDLs"}</p>
      <h1>{collection.title}</h1>
      {collection.description && <p className="pack-lede">{collection.description}</p>}
    </header>
    {pack && <div className="pack-buy surface">
      <div className="pack-buy-text">
        <p className="pack-buy-label">The whole pack · one product · one download</p>
        <Link href={`/products/${encodeURIComponent(pack.slug)}`} className="pack-buy-title">{pack.title}</Link>
        <Price book={pack} size="page" />
        <p className="pack-buy-note">{items.length} add-ons together. Or pick single add-ons below.</p>
      </div>
      <div className="pack-buy-actions">
        <BuyNow slug={pack.slug} title={pack.title} enabled={enabled} saleable={pack.saleable} />
        <AddToCart slug={pack.slug} title={pack.title} enabled={enabled} saleable={pack.saleable} saveable={pack.saveable} variant="page" />
      </div>
    </div>}
    {items.length > 0 && <h2 className="pack-inside">Inside this pack</h2>}
    {items.length > 0
      ? <ul className="pack-grid">{items.map((b) => <li key={b.slug}><BookCard book={b} enabled={enabled} /></li>)}</ul>
      : <p className="notice">No products in this pack are on sale yet.</p>}
  </div>;
}
