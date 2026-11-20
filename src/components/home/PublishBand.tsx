import Link from "next/link";
import Cover from "../Cover";

export type PublishCopy = { eyebrow: string; heading: string; description: string; buttonLabel: string; buttonUrl: string };
export const DEFAULT_PUBLISH: PublishCopy = { eyebrow: "For developers", heading: "Sell your Tally add-on with us", description: "Share your TDL add-on with Tally users across India.", buttonLabel: "Submit an add-on", buttonUrl: "/publish" };

export default function PublishBand({ covers, copy = DEFAULT_PUBLISH }: { covers: { slug: string; title: string; cover: string | null }[]; copy?: PublishCopy }) {
  return <section className="wrap section"><div className="publish-band reveal">
    <div>{copy.eyebrow && <p className="eyebrow">{copy.eyebrow}</p>}<h2>{copy.heading}</h2>
      {copy.description && <p>{copy.description}</p>}
      {copy.buttonLabel && <Link className="btn btn-primary" href={copy.buttonUrl || "/publish"}>{copy.buttonLabel} <span aria-hidden="true">→</span></Link>}</div>
    <div className="publish-stack" aria-hidden="true">{covers.slice(0, 3).map((c) => <span key={c.slug}><Cover src={c.cover} title={c.title} sizes="120px" /></span>)}</div>
  </div></section>;
}
