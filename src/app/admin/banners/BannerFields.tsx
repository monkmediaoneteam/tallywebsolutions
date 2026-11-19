"use client";

import { useState } from "react";
import ImageField from "@/components/ImageField";
import { PLACEMENTS, toIndiaInput, type BannerData } from "./banner-data";

// Ready-made starting points. Each one fills the whole banner so an admin can publish in a minute, then swap the artwork.
export const SAMPLE_PRESETS = [
  { name: "GST & E-Invoice", title: "Instant E-Invoice & Auto GST Reconciliation", subtitle: "GST 2.0 compliant",
    body: "1-click IRN generation, GSTR-2B matching and auto purchase voucher entry for TallyPrime.", image: "/banners/gst-automation.svg",
    link: "/category/gst-compliance", label: "Explore GST add-ons", theme: "sky" },
  { name: "WhatsApp automation", title: "Auto WhatsApp invoices & payment reminders", subtitle: "Official API integration",
    body: "Send PDF invoices, ledger accounts and payment reminders from TallyPrime.", image: "/banners/whatsapp-tally.svg",
    link: "/search?sort=popular", label: "Get WhatsApp add-on", theme: "green" },
  { name: "Mega sale", title: "Save up to 35% on top Tally add-ons", subtitle: "Limited period offer",
    body: "Verified TDL code, automated billing and instant lifetime licences.", image: "/banners/mega-sale-promo.svg",
    link: "/search?offer=1", label: "Shop sale offers", theme: "yellow" },
  { name: "Cloud & multi-branch", title: "Tally on cloud & multi-branch auto sync", subtitle: "Enterprise solution",
    body: "Access TallyPrime from anywhere, with 99.9% uptime.", image: "/banners/cloud-backup.svg",
    link: "/search", label: "View cloud plans", theme: "ink" },
] as const;

export const THEMES = ["sky", "green", "yellow", "ink"] as const;

const input = "field-input mt-1";

// The text, image, link and schedule fields of a banner, with starter templates that fill them in one click.
export default function BannerFields({ banner }: { banner?: BannerData }) {
  const [title, setTitle] = useState(banner?.title ?? "");
  const [subtitle, setSubtitle] = useState(typeof banner?.payload?.subtitle === "string" ? banner.payload.subtitle : "");
  const [body, setBody] = useState(banner?.body ?? "");
  const [linkUrl, setLinkUrl] = useState(banner?.link_url ?? "");
  const [linkLabel, setLinkLabel] = useState(banner?.link_label ?? "");
  const [theme, setTheme] = useState(typeof banner?.payload?.theme === "string" ? banner.payload.theme : "sky");
  const [image, setImage] = useState(banner?.image_url ?? "");
  const [imageKey, setImageKey] = useState(0);

  function applyPreset(p: (typeof SAMPLE_PRESETS)[number]) {
    setTitle(p.title); setSubtitle(p.subtitle); setBody(p.body);
    setLinkUrl(p.link); setLinkLabel(p.label); setTheme(p.theme);
    setImage(p.image); setImageKey((k) => k + 1); // remounts the image field so it shows the template artwork
  }

  return <>
    {!banner && <div className="sm:col-span-2 grid gap-2">
      <p className="text-sm font-medium">Start from a template</p>
      <div className="flex flex-wrap gap-2">{SAMPLE_PRESETS.map((p) => (
        <button key={p.name} type="button" onClick={() => applyPreset(p)} className="btn btn-ghost min-h-9 px-3 py-1.5 text-sm">{p.name}</button>))}</div>
      <p className="text-xs text-ink-soft">Fills the fields below. Change anything you like before saving.</p>
    </div>}
    <label className="text-sm">Headline<input name="title" required maxLength={200} className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="GST season offers" /></label>
    <label className="text-sm">Small label above<input name="subtitle" maxLength={200} className={input} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Limited time" /></label>
    <label className="text-sm sm:col-span-2">One line of text<input name="body" maxLength={160} className={input} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Up to 20% off selected add-ons" /></label>
    <label className="text-sm">Theme<select name="theme" className={input} value={theme} onChange={(e) => setTheme(e.target.value)}>
      {THEMES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</select></label>
    <label className="text-sm">Where it shows<select name="placement" className={input} defaultValue={String(banner?.payload?.placement ?? "hero")}>
      {Object.entries(PLACEMENTS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    <div className="sm:col-span-2"><ImageField key={imageKey} name="image_url" label="Image" value={image} hint="Hero: wide, about 1600 × 700. Side cards: about 800 × 600. JPEG, PNG or WebP, up to 5 MB." /></div>
    <ImageField name="mobile_image_url" label="Phone image (optional)" value={banner?.mobile_image_url ?? ""} ratio="4 / 5" hint="Shown on phones instead, about 800 × 1000. Leave empty to use the main image." />
    <label className="text-sm">Button link<input name="link_url" maxLength={2000} className={input} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="/search?offer=1" /></label>
    <label className="text-sm">Button text<input name="link_label" maxLength={100} className={input} value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Shop offers" /></label>
  </>;
}
