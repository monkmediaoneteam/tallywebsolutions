"use client";

import { useEffect, useRef } from "react";
import { typeOf } from "@/lib/home-sections";

export type FaqItem = { question: string; answer: string };
const DEFAULT_ITEMS = (typeOf("faq")?.blocks?.defaults ?? []) as FaqItem[];

// Questions beside one accordion: opening a question closes the one that was open, and the list fills the width.
export default function FaqGrid({ items = DEFAULT_ITEMS, heading = "Good to know", supportEmail = "" }: { items: FaqItem[]; heading?: string; supportEmail?: string }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    // Opening one closes the others (the native `name` grouping does this in newer browsers; this keeps older ones the same).
    const onToggle = (event: Event) => {
      const opened = event.target as HTMLDetailsElement;
      if (!opened.open) return;
      el.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((d) => { if (d !== opened) d.open = false; });
    };
    el.addEventListener("toggle", onToggle, true);
    return () => el.removeEventListener("toggle", onToggle, true);
  }, []);
  if (!items.length) return null;
  return <section id="faq" className="wrap section"><div className="faq-layout">
    <div className="faq-intro">{heading && <h2>{heading}</h2>}
      {supportEmail && <p>Can't find your answer? <a href={`mailto:${supportEmail}`}>Write to support</a> and we reply within a day.</p>}</div>
    <div className="faq-list" ref={list}>{items.map((x, i) => <details key={i} name="faq" className="faq-item"><summary>{x.question}</summary><p>{x.answer}</p></details>)}</div>
  </div></section>;
}
