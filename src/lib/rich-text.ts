// Descriptions are written with a small, safe formatting language: **bold**, *italic*, [links](https://…), "## " headings,
// "- " bullets and "1. " numbers, with blank lines between paragraphs. Plain text with blank lines is already valid, so every
// existing description keeps working. Nothing here ever produces HTML from the text: it is parsed into a tree and drawn by React.

export type Inline = string | { t: "b"; c: Inline[] } | { t: "i"; c: Inline[] } | { t: "a"; href: string; c: Inline[] };
export type Block = { t: "p"; lines: Inline[][] } | { t: "h"; c: Inline[] } | { t: "ul"; items: Inline[][] } | { t: "ol"; items: Inline[][] };

/** Only https links and links within the store are kept; anything else (javascript:, data:, //host) becomes plain text. */
export function safeHref(value: string): string | null {
  const v = value.trim();
  if (v.length > 2000) return null;
  return /^\/(?!\/)[^\s<>"'\\`]*$/.test(v) || /^https:\/\/[^\s<>"'\\`]+$/.test(v) || /^mailto:[^\s<>"'\\`]+@[^\s<>"'\\`]+$/.test(v) ? v : null;
}

const TOKEN = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(?!\s)([^\n]*?[^\s])\*\*(?!\*)|\*(?!\s)([^*\n]*?[^*\s])\*/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    const m = TOKEN.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index) out.push(rest.slice(0, m.index));
    if (m[1] !== undefined) { const href = safeHref(m[2]); out.push(href ? { t: "a", href, c: parseInline(m[1]) } : m[1]); }
    else if (m[3] !== undefined) out.push({ t: "b", c: parseInline(m[3]) });
    else out.push({ t: "i", c: parseInline(m[4]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: Inline[][] | null = null;
  let list: { t: "ul" | "ol"; items: Inline[][] } | null = null;
  const close = () => { if (para?.length) blocks.push({ t: "p", lines: para }); if (list?.items.length) blocks.push(list); para = null; list = null; };
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { close(); continue; }
    let m: RegExpExecArray | null;
    if ((m = /^#{1,3}\s+(.+)$/.exec(line))) { close(); blocks.push({ t: "h", c: parseInline(m[1].trim()) }); continue; }
    if ((m = /^\s*[-•]\s+(.+)$/.exec(line)) || (m = /^\s*\*\s+(.+)$/.exec(line))) {
      if (list?.t !== "ul") { close(); list = { t: "ul", items: [] }; }
      list.items.push(parseInline(m[1].trim())); continue;
    }
    if ((m = /^\s*\d+[.)]\s+(.+)$/.exec(line))) {
      if (list?.t !== "ol") { close(); list = { t: "ol", items: [] }; }
      list.items.push(parseInline(m[1].trim())); continue;
    }
    if (list) close();
    (para ??= []).push(parseInline(line.trim()));
  }
  close();
  return blocks;
}

const flat = (nodes: Inline[]): string => nodes.map((n) => (typeof n === "string" ? n : flat(n.c))).join("");

/** The text without any formatting, on one line: for meta descriptions, search and the home page row's one-line pitch. */
export function plainText(text: string | null | undefined): string {
  return parseBlocks(text ?? "").map((b) => (b.t === "p" ? b.lines.map(flat).join(" ") : b.t === "h" ? flat(b.c) : b.items.map(flat).join(", "))).join(" ").replace(/\s+/g, " ").trim();
}
