import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Cover from "../Cover";

// Category tiles: the category's own image (Admin > Categories), else its products' images, else a compact text tile.
export default function CategoryTiles({ tiles, heading = "Browse by category", subheading = "", linkLabel = "All add-ons", tileWidth = 200 }: { tiles: { slug: string; name: string; count: number; image?: string | null; covers: string[] }[]; heading?: string; subheading?: string; linkLabel?: string; tileWidth?: number }) {
  if (!tiles.length) return null;
  const anyArt = tiles.some((t) => t.image || t.covers.length);
  return <section className="wrap section">
    {(heading || linkLabel) && <div className="section-head reveal">{subheading ? <div>{heading && <h2>{heading}</h2>}<p>{subheading}</p></div> : heading ? <h2>{heading}</h2> : <span />}{linkLabel && <Link className="link-line" href="/search">{linkLabel} <span aria-hidden="true">→</span></Link>}</div>}
    <ul className={`tile-grid${anyArt ? "" : " tile-grid-compact"}`} style={tileWidth !== 200 ? { "--tile": `${tileWidth}px` } as React.CSSProperties : undefined}>{tiles.map((t) => <li key={t.slug} className="reveal">
      <Link className={`cat-tile surface surface-hover${anyArt ? "" : " cat-tile-compact"}`} href={`/category/${t.slug}`}>
        {anyArt && (t.image ? <span className="cat-art" aria-hidden="true"><img src={t.image} alt="" loading="lazy" /></span>
          : t.covers.length ? <span className="cat-fan plate" aria-hidden="true">{t.covers.slice(0, 3).map((c, i) => <span key={i}><Cover src={c} title={t.name} sizes="80px" /></span>)}</span>
          : <span className="cat-art cat-art-empty" aria-hidden="true" />)}
        <span className="cat-name">{t.name}</span>
        <span className="cat-meta"><span className="eyebrow">{t.count} {t.count === 1 ? "add-on" : "add-ons"}</span>{!anyArt && <ArrowUpRight size={16} aria-hidden="true" />}</span>
      </Link></li>)}</ul>
  </section>;
}
