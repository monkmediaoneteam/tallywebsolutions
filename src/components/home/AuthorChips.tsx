import Link from "next/link";

export default function AuthorChips({ authors, heading = "Built by" }: { authors: { id: string; name: string; photo_url: string | null }[]; heading?: string }) {
  if (!authors.length) return null;
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <section className="wrap section">{heading && <div className="section-head reveal"><h2>{heading}</h2></div>}
    <ul className="author-row">{authors.map((a) => <li key={a.id} className="reveal"><Link className="author-chip" href={`/authors/${encodeURIComponent(a.id)}`}>
      <span className="author-face">{a.photo_url ? <img src={a.photo_url} alt="" loading="lazy" /> : <span aria-hidden="true">{initials(a.name)}</span>}</span>
      <span>{a.name}</span></Link></li>)}</ul></section>;
}
