import Link from "next/link";
import { getPublicContent } from "@/lib/content";
import { flag } from "@/lib/env";
import { getStoreBooks } from "@/lib/store-data";
import BookCard from "@/components/BookCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bundles", description: "Several TDL add-ons together, for less than buying them one by one. One purchase, one ZIP download." };

// Every bundle that is for sale: one product each, priced below the TDLs added up.
export default async function BundlesPage() {
  const [{ collections }, books] = await Promise.all([getPublicContent(), getStoreBooks(new Date())]);
  const bySlug = new Map(books.map((b) => [b.slug, b]));
  const bundles = collections.map((c) => bySlug.get(c.slug)).filter((b): b is (typeof books)[number] => Boolean(b));
  const enabled = flag("COMMERCE_ENABLED");
  return <div className="wrap section collection-page">
    <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Bundles</span></nav>
    <header className="pack-head">
      <p className="eyebrow">Bundles</p>
      <h1>TDLs that work together, for less</h1>
      <p className="pack-lede">Each bundle is one purchase and one ZIP download with all of its TDLs, priced below buying them one by one.</p>
    </header>
    {bundles.length === 0
      ? <p className="notice">No bundles yet. Browse <Link className="underline" href="/search">all add-ons</Link>.</p>
      : <ul className="pack-grid">{bundles.map((b) => <li key={b.slug}><BookCard book={b} enabled={enabled} /></li>)}</ul>}
  </div>;
}
