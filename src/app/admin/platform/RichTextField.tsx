"use client";
import { useRef, useState } from "react";
import { Bold, Heading2, Italic, Link2, List, ListOrdered } from "lucide-react";
import RichText from "@/components/RichText";

type Edit = { text: string; start: number; end: number };

// A description editor with a formatting toolbar and a live preview of how it will look in the store.
// The text is saved as plain text with light formatting marks (see lib/rich-text.ts), so it is safe wherever it is shown.
export default function RichTextField({ name, label, value = "", maxLength = 20000, rows = 8, hint }: { name: string; label: string; value?: string; maxLength?: number; rows?: number; hint?: string }) {
  const [text, setText] = useState(value);
  const box = useRef<HTMLTextAreaElement>(null);
  function apply(change: (t: string, start: number, end: number) => Edit) {
    const el = box.current; if (!el) return;
    const next = change(text, el.selectionStart, el.selectionEnd);
    setText(next.text.slice(0, maxLength));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(next.start, next.end); });
  }
  const wrap = (mark: string, sample: string) => apply((t, s, e) => {
    const picked = t.slice(s, e) || sample;
    return { text: t.slice(0, s) + mark + picked + mark + t.slice(e), start: s + mark.length, end: s + mark.length + picked.length };
  });
  // Headings and lists work on whole lines; applying the same one again takes it off.
  const lines = (kind: "h" | "ul" | "ol") => apply((t, s, e) => {
    const from = t.lastIndexOf("\n", s - 1) + 1, to = t.indexOf("\n", e) < 0 ? t.length : t.indexOf("\n", e);
    const mark = (l: string) => l.replace(/^(#{1,3}\s+|\s*[-•*]\s+|\s*\d+[.)]\s+)/, "");
    const rows_ = t.slice(from, to).split("\n");
    const has = (l: string) => (kind === "h" ? /^#{1,3}\s+/ : kind === "ul" ? /^\s*[-•*]\s+/ : /^\s*\d+[.)]\s+/).test(l);
    const off = rows_.every((l) => !l.trim() || has(l));
    const out = rows_.map((l, i) => (!l.trim() ? l : off ? mark(l) : (kind === "h" ? "## " : kind === "ul" ? "- " : `${i + 1}. `) + mark(l))).join("\n");
    return { text: t.slice(0, from) + out + t.slice(to), start: from, end: from + out.length };
  });
  const link = () => {
    const url = window.prompt("Link address (https://… or /page)");
    if (!url) return;
    apply((t, s, e) => {
      const picked = t.slice(s, e) || "link text";
      const markup = `[${picked}](${url.trim()})`;
      return { text: t.slice(0, s) + markup + t.slice(e), start: s + 1, end: s + 1 + picked.length };
    });
  };
  const tools = [
    { label: "Bold", icon: Bold, run: () => wrap("**", "bold text") }, { label: "Italic", icon: Italic, run: () => wrap("*", "italic text") },
    { label: "Heading", icon: Heading2, run: () => lines("h") }, { label: "Bulleted list", icon: List, run: () => lines("ul") },
    { label: "Numbered list", icon: ListOrdered, run: () => lines("ol") }, { label: "Link", icon: Link2, run: link },
  ];
  return <div className="grid gap-2 text-sm">
    <label htmlFor={`${name}-editor`}>{label}</label>
    <div className="overflow-hidden rounded-2 border border-line bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-bg-2 p-1.5" role="toolbar" aria-label="Formatting">
        {tools.map(({ label: l, icon: Icon, run }) => <button key={l} type="button" onClick={run} title={l} aria-label={l}
          className="grid h-8 w-8 place-items-center rounded-md text-ink-soft hover:bg-white hover:text-ink"><Icon size={16} aria-hidden="true" /></button>)}
      </div>
      <textarea id={`${name}-editor`} ref={box} name={name} value={text} rows={rows} maxLength={maxLength} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); wrap("**", "bold text"); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") { e.preventDefault(); wrap("*", "italic text"); } }}
        className="block w-full resize-y border-0 bg-transparent p-3 text-[15px] outline-none" />
    </div>
    <p className="text-xs text-ink-soft">{hint ?? "Select text, then use the buttons. Leave a blank line between paragraphs."}</p>
    {text.trim() && <div className="rounded-2 border border-dashed border-line-2 p-4"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-mute">Preview</p><RichText text={text} /></div>}
  </div>;
}
