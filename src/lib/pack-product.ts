import { zipSync } from "fflate";

// A pack is one product: its price is its add-ons' prices added up less the pack percent, and its download is one ZIP holding their files.
// Pure helpers only (no database, no storage), so they are tested offline.

/** The pack's selling price in paise: the total less the percent, in whole rupees, never below ₹1 and never above the total. */
export function packPrice(total: number, percent: number): number {
  if (!(total > 0)) return 0;
  const off = Math.round((total * (100 - Math.min(90, Math.max(0, percent)))) / 100 / 100) * 100;
  return Math.max(100, Math.min(total, off));
}

/** A flat, safe, unique name for a file inside the ZIP: no folders, no control characters, and "(2)" added to a repeat. */
export function zipEntryName(name: string, taken: Set<string>): string {
  const clean = (name.split(/[\\/]/).pop() ?? "").replace(/[\x00-\x1f<>:"|?*]/g, "").replace(/^\.+/, "").trim().slice(0, 120) || "file";
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean, ext = dot > 0 ? clean.slice(dot) : "";
  let out = clean;
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${stem} (${n})${ext}`;
  taken.add(out.toLowerCase());
  return out;
}

export function buildPackZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const taken = new Set<string>();
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[zipEntryName(f.name, taken)] = f.bytes;
  return zipSync(entries, { level: 6 });
}

/** The one-line description a pack product gets. */
export const packDescription = (count: number, percent: number) =>
  `All ${count} add-ons in one download${percent > 0 ? `, ${percent}% less than buying them one by one` : ""}.`;
