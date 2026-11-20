"use client";

import { useState } from "react";
import { EMPTY_CHOICES, LAYOUTS, LIMITS, POSITIONS, SIZE_PRESETS, type BannerSection, type Layout } from "@/lib/banner-sections";

const input = "field-input mt-1";
const num = (name: string, label: string, value: number, set: (n: number) => void, [min, max]: readonly [number, number], hint?: string) =>
  <label className="text-sm">{label}<input name={name} type="number" required min={min} max={max} step={1} className={input} value={Number.isFinite(value) ? value : ""}
    onChange={(e) => set(e.target.value === "" ? NaN : Number(e.target.value))} />{hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}</label>;

// A schematic of the section: how many frames, in which layout, in the shape of the image size chosen.
function Preview({ layout, max, columns, width, height, fit }: { layout: Layout; max: number; columns: number; width: number; height: number; fit: string }) {
  const shape = width > 0 && height > 0 ? `${width} / ${height}` : "16 / 5";
  const n = Math.max(1, Math.min(layout === "single" || layout === "carousel" ? 1 : max || 1, layout === "grid" ? columns * 2 : 4));
  const box = (i: number) => <div key={i} className="grid place-items-center rounded-lg border border-dashed border-line-2 bg-bg-2 text-[11px] text-ink-soft" style={{ aspectRatio: shape }}>
    {width}×{height}<span className="sr-only"> frame {i + 1}</span></div>;
  return <div className="rounded-xl border border-line bg-white p-4" aria-label="Layout preview" role="img">
    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft">Preview</p>
    <div className="relative grid gap-2" style={layout === "grid" ? { gridTemplateColumns: `repeat(${columns || 1}, minmax(0, 1fr))` } : undefined}>
      {Array.from({ length: n }, (_, i) => box(i))}
      {layout === "carousel" && <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className={`h-1.5 rounded-full bg-ink-soft/60 ${i === 0 ? "w-4" : "w-1.5"}`} />)}</div>}
    </div>
    <p className="mt-3 text-xs text-ink-soft">{layout === "carousel" ? `Rotating, up to ${max} images.` : layout === "single" ? "One image." : layout === "grid" ? `${columns} across, up to ${max} images.` : `Stacked, up to ${max} images.`} Images are {fit === "contain" ? "shown whole" : "cropped to fill the frame"}.</p>
  </div>;
}

// One banner section's settings. Saving a built-in section stores the admin's version; Reset (on the edit page) brings back the default.
export default function SectionForm({ section, isNew, returnTo, doneTo }: { section: BannerSection; isNew?: boolean; returnTo: string; doneTo?: string }) {
  const [layout, setLayout] = useState<Layout>(section.layout);
  const [max, setMax] = useState(section.max);
  const [columns, setColumns] = useState(section.columns);
  const [width, setWidth] = useState(section.width);
  const [height, setHeight] = useState(section.height);
  const [mobileWidth, setMobileWidth] = useState(section.mobileWidth);
  const [mobileHeight, setMobileHeight] = useState(section.mobileHeight);
  const [autoplay, setAutoplay] = useState(section.autoplay);
  const [fit, setFit] = useState<string>(section.fit);
  const [position, setPosition] = useState<string>(section.position);
  const empties = EMPTY_CHOICES[position as keyof typeof POSITIONS];

  return <form action="/api/admin/platform/content" method="post" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
    <input type="hidden" name="section" value="modules" /><input type="hidden" name="type" value="banner-section" />
    <input type="hidden" name="id" value={section.id ?? ""} /><input type="hidden" name="updated_at" value={section.updatedAt ?? ""} />
    <input type="hidden" name="status" value="published" />
    <input type="hidden" name="return_to" value={returnTo} />{doneTo && <input type="hidden" name="done_to" value={doneTo} />}
    {!isNew && <input type="hidden" name="key" value={section.key} />}

    <div className="grid content-start gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-base font-semibold">Basics</legend>
        <label className="text-sm">Name<input name="title" required maxLength={200} className={input} defaultValue={isNew ? "" : section.name} placeholder="Festival offers row" /></label>
        {isNew ? <label className="text-sm">Key<input name="key" required maxLength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={input} placeholder="festival-row" />
          <span className="mt-1 block text-xs text-ink-soft">Short ID, lowercase. Cannot be changed later.</span></label>
          : <p className="text-sm">Key<span className="field-input mt-1 block bg-bg-2 text-ink-soft">{section.key}</span></p>}
        <label className="text-sm">Switched<select name="enabled" className={input} defaultValue={section.enabled ? "on" : "off"}><option value="on">On: shows on the site</option><option value="off">Off: hidden on the site</option></select></label>
        <label className="text-sm">Order<input name="sort" type="number" required min={-1000} max={1000} step={1} className={input} defaultValue={section.sort} />
          <span className="mt-1 block text-xs text-ink-soft">Lower first, among sections in the same place.</span></label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-base font-semibold">Where and how</legend>
        <label className="text-sm sm:col-span-2">Where it shows<select name="position" className={input} value={position} onChange={(e) => setPosition(e.target.value)}>
          {Object.entries(POSITIONS).map(([value, p]) => <option key={value} value={value}>{p.label}</option>)}</select></label>
        <label className="text-sm sm:col-span-2">Layout<select name="layout" className={input} value={layout} onChange={(e) => setLayout(e.target.value as Layout)}>
          {Object.entries(LAYOUTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {num("max", "Banners shown (max)", max, setMax, LIMITS.max, "Live banners beyond this wait their turn.")}
        {layout === "grid" ? num("columns", "Columns", columns, setColumns, LIMITS.columns, "How many images sit side by side.")
          : <><input type="hidden" name="columns" value={columns} /><p className="text-sm text-ink-soft sm:pt-6">Columns apply to the grid layout.</p></>}
        {layout === "carousel" ? num("autoplay", "Autoplay, seconds", autoplay, setAutoplay, LIMITS.autoplay, "0 = no autoplay. Visitors can always pause.")
          : <input type="hidden" name="autoplay" value={autoplay} />}
        <label className="text-sm sm:col-span-2">When there are no banners<select name="empty" className={input} defaultValue={section.empty}>
          {empties.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-base font-semibold">Image settings</legend>
        <div className="sm:col-span-2">
          <p className="text-sm">Size presets</p>
          <div className="mt-1 flex flex-wrap gap-2">{SIZE_PRESETS.map((p) => <button key={p.label} type="button" className="btn btn-ghost min-h-9 px-3 py-1.5 text-sm"
            aria-pressed={width === p.width && height === p.height}
            onClick={() => { setWidth(p.width); setHeight(p.height); setMobileWidth(p.mobileWidth); setMobileHeight(p.mobileHeight); }}>{p.label}</button>)}</div>
        </div>
        {num("width", "Image width, px", width, setWidth, LIMITS.width)}
        {num("height", "Image height, px", height, setHeight, LIMITS.height, "Width and height set the banner's shape on screens wider than a phone.")}
        {num("mobile_width", "Phone image width, px", mobileWidth, setMobileWidth, LIMITS.width)}
        {num("mobile_height", "Phone image height, px", mobileHeight, setMobileHeight, LIMITS.height, "Shape on phones, for banners that have a phone image.")}
        <label className="text-sm sm:col-span-2">Image fit<select name="fit" className={input} value={fit} onChange={(e) => setFit(e.target.value)}>
          <option value="cover">Fill the frame: crop the edges if the shape differs</option><option value="contain">Show the whole image: leave empty margins if the shape differs</option></select></label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button name="action" value="save" type="submit" className="btn btn-primary">{isNew ? "Add section" : "Save changes"}</button>
        <a className="btn btn-ghost" href="/admin/banners/sections">Cancel</a>
      </div>
    </div>

    <aside className="lg:sticky lg:top-6 lg:self-start"><Preview layout={layout} max={max} columns={columns} width={width} height={height} fit={fit} /></aside>
  </form>;
}
