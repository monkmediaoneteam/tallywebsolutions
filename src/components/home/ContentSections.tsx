import Link from "next/link";
import type { CSSProperties } from "react";
import type { Settings } from "@/lib/home-sections";

const s = (v: unknown) => (typeof v === "string" ? v : "");
const AI: Record<string, string> = { top: "flex-start", middle: "center", bottom: "flex-end" };
const JC: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
const TA: Record<string, string> = { left: "start", center: "center", right: "end" };
const place = (pos: string) => { const [v, h] = pos.split("-"); return { ai: AI[v] ?? "center", jc: JC[h] ?? "flex-start" }; };
const sizeClass = (v: unknown, prefix: string) => (v === "small" ? ` ${prefix}-small` : v === "large" ? ` ${prefix}-large` : "");

// Plain text, with blank lines starting new paragraphs. Always escaped by React: no markup can be injected.
function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p, i) => <p key={i} className="preserve-lines">{p}</p>)}</>;
}
function Cta({ settings, className }: { settings: Settings; className: string }) {
  const label = s(settings.button_label);
  return label ? <Link href={s(settings.button_url) || "/"} className={className}>{label} <span aria-hidden="true">→</span></Link> : null;
}

// Image with text overlay: a large image, with the heading, text and button laid over it.
export function ImageOverlay({ settings: o }: { settings: Settings }) {
  const adapt = o.height_desktop === "adapt", mAdapt = o.height_mobile === "auto";
  const d = place(s(o.content_position) || "middle-left"), m = place(s(o.mobile_position) || "bottom-left");
  const align = s(o.text_align) || "left";
  const style = {
    "--io-h": adapt ? "auto" : s(o.height_desktop), "--io-mh": mAdapt ? "auto" : s(o.height_mobile),
    "--io-overlay": s(o.overlay_color) || "#000000", "--io-opacity": Number(o.overlay_opacity ?? 35) / 100, "--io-w": `${Number(o.content_width ?? 560)}px`,
    "--io-ai": d.ai, "--io-jc": d.jc, "--io-mai": m.ai, "--io-mjc": m.jc,
    "--io-items": JC[align], "--io-align": TA[align], "--io-mitems": JC[align], "--io-malign": TA[align],
    ...(s(o.text_color) ? { "--io-text": s(o.text_color) } : {}), ...(s(o.background) ? { "--io-bg": s(o.background) } : {}),
  } as CSSProperties;
  const image = s(o.image), mobile = s(o.mobile_image);
  const btn = s(o.button_style) === "light" ? "btn btn-light" : s(o.button_style) === "ghost" ? "btn btn-ghost" : "btn btn-primary";
  return <section className="wrap section"><div className="io" style={style} data-adapt={adapt && image ? "" : undefined} data-m-adapt={mAdapt && image ? "" : undefined}>
    <div className="io-media" aria-hidden={image ? undefined : "true"}>
      {image && <picture>{mobile && <source media="(max-width: 640px)" srcSet={mobile} />}<img src={image} alt="" loading="lazy" /></picture>}
    </div>
    <span className="io-shade" aria-hidden="true" />
    <div className="io-content"><div className={`io-box${sizeClass(o.heading_size, "io")}`}>
      {s(o.subheading) && <p className="eyebrow">{s(o.subheading)}</p>}
      {s(o.heading) && <h2>{s(o.heading)}</h2>}
      {s(o.description) && <Paragraphs text={s(o.description)} />}
      <Cta settings={o} className={btn} />
    </div></div>
  </div></section>;
}

const RATIO: Record<string, string> = { landscape: "4 / 3", square: "1 / 1", portrait: "4 / 5", wide: "16 / 9" };
const WIDTH: Record<string, string> = { small: "40%", medium: "50%", large: "60%" };

// Image with text: the image on one side, the words on the other.
export function ImageText({ settings: o }: { settings: Settings }) {
  const align = s(o.text_align) || "left";
  const adapt = o.image_ratio === "adapt";
  const style = { "--it-img": WIDTH[s(o.image_width)] ?? "50%", "--it-ratio": RATIO[s(o.image_ratio)] ?? "4 / 3", "--it-va": o.vertical_align === "top" ? "start" : o.vertical_align === "bottom" ? "end" : "center",
    "--it-items": JC[align], "--it-align": TA[align] } as CSSProperties;
  const image = s(o.image);
  return <section className="wrap section"><div className={`it${o.image_position === "right" ? " it-right" : ""}${o.mobile_image_first ? " it-img-first" : ""}`} style={style}>
    <div className={`it-art${o.rounded_image ? " it-round" : ""}${image ? "" : " it-empty"}`} data-adapt={adapt && image ? "" : undefined}>
      {image ? <img src={image} alt="" loading="lazy" /> : <span className="eyebrow">Add an image</span>}</div>
    <div className={`it-copy${sizeClass(o.heading_size, "it")}`}>
      {s(o.eyebrow) && <p className="eyebrow">{s(o.eyebrow)}</p>}
      {s(o.heading) && <h2>{s(o.heading)}</h2>}
      {s(o.description) && <Paragraphs text={s(o.description)} />}
      <Cta settings={o} className="btn btn-primary" />
    </div>
  </div></section>;
}

// Rich text: a block of words, centred or aligned.
export function RichText({ settings: o }: { settings: Settings }) {
  const align = s(o.text_align) || "center";
  const style = { "--rt-w": `${Number(o.content_width ?? 720)}px`, "--rt-items": JC[align], "--rt-align": TA[align],
    "--rt-ml": align === "left" ? "0" : "auto", "--rt-mr": align === "right" ? "0" : "auto" } as CSSProperties;
  return <section className="wrap section"><div className={`rt${sizeClass(o.heading_size, "rt")}`} style={style}>
    {s(o.eyebrow) && <p className="eyebrow">{s(o.eyebrow)}</p>}
    {s(o.heading) && <h2>{s(o.heading)}</h2>}
    {s(o.description) && <Paragraphs text={s(o.description)} />}
    <Cta settings={o} className="btn btn-primary" />
  </div></section>;
}
