"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import type { Banner, PlacedSection } from "@/lib/home";
import { ratio } from "@/lib/banner-sections";

type Item = { key: string; image: string | null; mobileImage: string | null; href: string | null; alt: string };

const toItem = (b: Banner): Item => ({ key: b.id, image: b.image!, mobileImage: b.mobileImage, href: b.href, alt: b.title });

function Art({ item, eager, hidden }: { item: Item; eager: boolean; hidden?: boolean }) {
  if (!item.image) return <div className="banner-item is-empty" hidden={hidden} aria-hidden="true" />;
  const picture = <picture>
    {item.mobileImage && <source media="(max-width: 640px)" srcSet={item.mobileImage} />}
    <img src={item.image} alt={item.alt} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} />
  </picture>;
  const className = `banner-item${item.mobileImage ? " has-mobile" : ""}`;
  return item.href
    ? <Link href={item.href} className={className} aria-label={item.alt || undefined} tabIndex={hidden ? -1 : undefined} hidden={hidden}>{picture}</Link>
    : <div className={className} hidden={hidden}>{picture}</div>;
}

// One banner section, drawn in the layout, size and count the admin set in Admin > Banners > Sections.
// The images are the whole banner: no text is drawn over them. An empty section set to "placeholder" shows `fallback`
// (the store's own hero or product cards at the top of the homepage) or else a plain frame in the section's shape.
export default function BannerSectionView({ placed, wrap = "", eager = false, fallback }: { placed: PlacedSection; wrap?: string; eager?: boolean; fallback?: ReactNode }) {
  const { section, banners } = placed;
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const empty = !banners.length;
  const items: Item[] = empty ? (section.empty === "placeholder" && !fallback ? [{ key: "empty", image: null, mobileImage: null, href: null, alt: "" }] : []) : banners.map(toItem);
  const carousel = section.layout === "carousel" && items.length > 1;
  useEffect(() => {
    if (!carousel || paused || hover || reduced || !section.autoplay) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), section.autoplay * 1000);
    return () => clearInterval(timer);
  }, [carousel, paused, hover, reduced, section.autoplay, items.length]);
  if (empty && section.empty === "placeholder" && fallback) return wrap ? <div className={wrap}>{fallback}</div> : <>{fallback}</>;
  if (!items.length) return null;

  const shown = section.layout === "single" ? items.slice(0, 1) : items;
  const style = { "--ratio": ratio(section.width, section.height), "--mratio": ratio(section.mobileWidth, section.mobileHeight), "--cols": section.columns, "--fit": section.fit } as CSSProperties;
  const go = (step: number) => setIndex((i) => (i + step + items.length) % items.length);
  const body = <section className={`banner-section layout-${section.layout}`} style={style} aria-label={section.name}
    aria-roledescription={carousel ? "carousel" : undefined} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
    {shown.map((item, i) => <Art key={item.key} item={item} eager={eager && i === 0} hidden={carousel ? i !== index : undefined} />)}
    {carousel && <div className="banner-controls">
      <button type="button" className="round-btn" onClick={() => go(-1)} aria-label="Previous banner"><ChevronLeft size={17} aria-hidden="true" /></button>
      <div className="hero-dots">{items.map((item, i) => <button key={item.key} type="button" aria-label={`Show banner ${i + 1}`} aria-current={i === index ? "true" : undefined} onClick={() => setIndex(i)} />)}</div>
      <button type="button" className="round-btn" onClick={() => go(1)} aria-label="Next banner"><ChevronRight size={17} aria-hidden="true" /></button>
      {mounted && !reduced && section.autoplay > 0 && <button type="button" className="round-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play banners" : "Pause banners"}>
        {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}</button>}
    </div>}
  </section>;
  return wrap ? <div className={wrap}>{body}</div> : body;
}

// All sections placed at one position, in admin order.
export function SectionList({ list, wrap, eager, fallback }: { list: PlacedSection[]; wrap?: string; eager?: boolean; fallback?: ReactNode }) {
  return <>{list.map((p, i) => <BannerSectionView key={p.section.key} placed={p} wrap={wrap} eager={eager && i === 0} fallback={fallback} />)}</>;
}
