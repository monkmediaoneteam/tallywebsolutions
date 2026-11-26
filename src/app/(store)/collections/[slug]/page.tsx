import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicContent } from "@/lib/content";
import { flag } from "@/lib/env";
import { getStoreBooks } from "@/lib/store-data";
import BookCard from "@/components/BookCard";

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
  const offered = items.some((b) => b.offers && b.offers.length > 0);
  return <div className="wrap section collection-page">
    <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{collection.title}</span></nav>
    <header className="pack-head">
      <p className="eyebrow">Pack · {items.length} {items.length === 1 ? "TDL" : "TDLs"}</p>
      <h1>{collection.title}</h1>
      {collection.description && <p className="pack-lede">{collection.description}</p>}
      {offered && <p className="pack-offer">The pack offer is shown on each product below.</p>}
    </header>
    {items.length > 0
      ? <ul className="pack-grid">{items.map((b) => <li key={b.slug}><BookCard book={b} enabled={enabled} /></li>)}</ul>
      : <p className="notice">No products in this pack are on sale yet.</p>}
  </div>;
}
