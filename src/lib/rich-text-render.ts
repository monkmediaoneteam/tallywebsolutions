import { createElement as h, type ReactNode } from "react";
import { parseBlocks, type Inline } from "./rich-text";

const inline = (nodes: Inline[]): ReactNode[] => nodes.map((n, i) => {
  if (typeof n === "string") return n;
  if (n.t === "b") return h("strong", { key: i }, inline(n.c));
  if (n.t === "i") return h("em", { key: i }, inline(n.c));
  const external = /^https?:/i.test(n.href);
  return h("a", { key: i, href: n.href, className: "rich-link", ...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {}) }, inline(n.c));
});

/** Draws the description as React elements. Text is always text: it can never become markup. */
export function renderRich(text: string | null | undefined): ReactNode[] {
  return parseBlocks(text ?? "").map((b, i) => {
    if (b.t === "h") return h("h3", { key: i, className: "rich-h" }, inline(b.c));
    if (b.t === "ul" || b.t === "ol") return h(b.t, { key: i }, b.items.map((item, k) => h("li", { key: k }, inline(item))));
    return h("p", { key: i },b.lines.flatMap((line, k) => (k ? [h("br", { key: `b${k}` }), ...inline(line)] : inline(line))));
  });
}
