import { zipSync } from "fflate";

/** A flat, safe, unique name for a file inside a ZIP: no folders, no control characters, and "(2)" added to a repeat. */
export function zipEntryName(name: string, taken: Set<string>): string {
  const clean = (name.split(/[\\/]/).pop() ?? "").replace(/[\x00-\x1f<>:"|?*]/g, "").replace(/^\.+/, "").trim().slice(0, 120) || "file";
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean, ext = dot > 0 ? clean.slice(dot) : "";
  let out = clean;
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${stem} (${n})${ext}`;
  taken.add(out.toLowerCase());
  return out;
}

/** One ZIP holding every file, byte for byte, under safe unique names. */
export function buildZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const taken = new Set<string>();
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[zipEntryName(f.name, taken)] = f.bytes;
  return zipSync(entries, { level: 6 });
}
