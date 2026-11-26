import Link from "next/link";
import BookCard from "../BookCard";
import type { PublicBook } from "../book-data";
import type { Collection } from "@/lib/content";

// One row per published pack that has products on sale. Desktop shows ten products (two rows of five).
export default function CollectionRows({ collections, books, enabled, heading, subheading, limit }: {
  collections: Collection[]; books: PublicBook[]; enabled: boolean; heading: string; subheading: string; limit: number;
}) {
  const bySlug = new Map(books.map((b) => [b.slug, b]));
  const rows = collections.map((c) => ({
    c, items: c.book_slugs.map((s) => bySlug.get(s)).filter((b): b is PublicBook => Boolean(b)).slice(0, limit),
  }));
  if (!rows.length) return null;
  return <section className="wrap section pack-rows">
    {heading && <div className="section-head"><div><h2>{heading}</h2>{subheading && <p>{subheading}</p>}</div></div>}
    {rows.map(({ c, items }) => <div className="pack-row" key={c.slug}>
      <div className="pack-row-head">
        <div><h3>{c.title}</h3>{c.description && <p>{c.description}</p>}</div>
        <Link className="link-line" href={`/collections/${encodeURIComponent(c.slug)}`}>View all {c.book_slugs.length} <span aria-hidden="true">→</span></Link>
      </div>
      {items.length > 0
        ? <ul className="pack-grid">{items.map((b) => <li key={b.slug}><BookCard book={b} enabled={enabled} morph={false} /></li>)}</ul>
        : <p className="pack-empty">No products in this pack are on sale yet.</p>}
    </div>)}
  </section>;
}
