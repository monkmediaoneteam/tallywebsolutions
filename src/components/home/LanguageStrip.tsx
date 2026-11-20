import Link from "next/link";
import { LANGUAGE_NATIVE } from "@/lib/languages";

export default function LanguageStrip({ languages, heading = "Read in your language" }: { languages: { name: string; count: number }[]; heading?: string }) {
  if (languages.length < 2) return null;
  return <section className="wrap section">{heading && <div className="section-head reveal"><h2>{heading}</h2></div>}
    <ul className="lang-row">{languages.map((l) => <li key={l.name} className="reveal"><Link className="lang-chip surface surface-hover" href={`/search?language=${encodeURIComponent(l.name)}`}>
      <span className="lang-native">{LANGUAGE_NATIVE[l.name] ?? l.name}</span><span className="eyebrow">{l.name} · {l.count}</span></Link></li>)}</ul></section>;
}
