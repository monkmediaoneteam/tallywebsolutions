"use client";
import { useState } from "react";
import { slugify } from "@/lib/slug";

// Title and web address for a collection. For a new one the address follows the title until it is edited; a saved one keeps its address.
export default function TitleAndSlug({ title, slug, locked }: { title: string; slug: string; locked: boolean }) {
  const [name, setName] = useState(title);
  const [custom, setCustom] = useState<string | null>(null);
  const shown = locked ? slug : custom ?? slugify(name).slice(0, 120);
  return <>
    <label className="text-sm">Title<input name="title" required maxLength={200} className="field-input mt-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
    <label className="text-sm">Web address<input name="slug" required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={locked}
      className={`field-input mt-1 ${locked ? "bg-bg-2 text-ink-soft" : ""}`} value={shown}
      onChange={(e) => setCustom(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} onBlur={() => custom !== null && setCustom(slugify(custom).slice(0, 120))} />
      <span className="mt-1 block text-xs text-ink-mute">{locked ? "Fixed once saved." : "Made from the title. Change it only if you need to."}</span></label>
  </>;
}
