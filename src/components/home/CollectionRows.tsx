import BookCard from "../BookCard";
import Carousel from "../Carousel";
import type { PublicBook } from "../book-data";
import type { Collection } from "@/lib/content";
import { plainText } from "@/lib/rich-text";

// One swipeable row per published pack, like the other product rows: the pack's name, its one-line pitch,
// its first products (ten by default) and "See all" to the whole pack.
export default function CollectionRows({ collections, books, enabled, heading, subheading, limit, cardWidth = 216 }: {
  collections: Collection[]; books: PublicBook[]; enabled: boolean; heading: string; subheading: string; limit: number; cardWidth?: number;
}) {
  const bySlug = new Map(books.map((b) => [b.slug, b]));
  const rows = collections.map((c) => ({
    c, items: c.book_slugs.map((s) => bySlug.get(s)).filter((b): b is PublicBook => Boolean(b)).slice(0, limit),
  })).filter((r) => r.items.length > 0);
  if (!rows.length) return null;
  return <>
    {heading && <div className="wrap section pack-intro"><h2>{heading}</h2>{subheading && <p>{subheading}</p>}</div>}
    {rows.map(({ c, items }) => <div className="wrap section" key={c.slug} data-card={cardWidth !== 216 ? "" : undefined}
      style={cardWidth !== 216 ? { "--card": `${cardWidth}px` } as React.CSSProperties : undefined}>
      <Carousel title={c.title} tagline={plainText(c.description) || undefined} href={`/collections/${encodeURIComponent(c.slug)}`}>
        {items.map((b) => <BookCard key={b.slug} book={b} enabled={enabled} morph={false} />)}</Carousel>
    </div>)}
  </>;
}
