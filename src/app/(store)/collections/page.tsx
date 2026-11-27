import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPublicContent } from "@/lib/content";
import { getStoreBooks } from "@/lib/store-data";
import ProductTile from "@/components/ProductTile";
import { plainText } from "@/lib/rich-text";

export const dynamic = "force-dynamic";
export const metadata = { title: "Packs", description: "Bundles of TDL add-ons for one job, with a pack price." };

// Every published pack, with a few of its products shown.
export default async function CollectionsPage() {
  const [{ collections }, books] = await Promise.all([getPublicContent(), getStoreBooks(new Date())]);
  const bySlug = new Map(books.map((b) => [b.slug, b]));
  const packs = collections.map((c) => {
    const items = c.book_slugs.map((s) => bySlug.get(s)).filter((b): b is (typeof books)[number] => Boolean(b));
    const from = items.length ? Math.min(...items.map((b) => b.price)) : 0;
    return { c, items, from };
  });
  return <div className="wrap section collection-page">
    <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Packs</span></nav>
    <header className="pack-head">
      <p className="eyebrow">Packs</p>
      <h1>Add-ons that work together</h1>
      <p className="pack-lede">Each pack groups the TDLs for one job. Buy the pack, or pick single add-ons.</p>
    </header>
    {packs.length === 0
      ? <p className="notice">No packs yet. Browse <Link className="underline" href="/search">all add-ons</Link>.</p>
      : <ul className="pack-cards">{packs.map(({ c, items }) => <li key={c.slug}>
        <Link href={`/collections/${encodeURIComponent(c.slug)}`} className="pack-card surface surface-hover">
          <span className="pack-thumbs" aria-hidden="true">{items.slice(0, 3).map((b) => <span key={b.slug}><ProductTile src={b.cover} title={b.title} sizes="120px" /></span>)}</span>
          <span className="pack-card-body">
            <span className="pack-card-title">{c.title}</span>
            {c.description && <span className="pack-card-text">{plainText(c.description)}</span>}
            <span className="pack-card-foot">{c.book_slugs.length} {c.book_slugs.length === 1 ? "add-on" : "add-ons"}<span className="pack-card-go">View pack <ArrowRight size={15} aria-hidden="true" /></span></span>
          </span>
        </Link></li>)}</ul>}
  </div>;
}
