import { typeOf } from "@/lib/home-sections";

export type FaqItem = { question: string; answer: string };
const DEFAULT_ITEMS = (typeOf("faq")?.blocks?.defaults ?? []) as FaqItem[];

export default function FaqGrid({ items = DEFAULT_ITEMS, heading = "Good to know", columns = 2 }: { items: FaqItem[]; heading?: string; columns?: number }) {
  if (!items.length) return null;
  return <section id="faq" className="wrap section">{heading && <div className="section-head reveal"><h2>{heading}</h2></div>}
    <div className={`faq-grid${columns === 1 ? " faq-one" : ""}`}>{items.map((x, i) => <details key={i} className="faq-item surface reveal"><summary>{x.question}</summary><p>{x.answer}</p></details>)}</div></section>;
}
