"use client";

import { useRef, useState } from "react";
import { put } from "@vercel/blob/client";
import { ImageUp, RefreshCw, X } from "lucide-react";

const MAX = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

// An image slot inside an admin form: preview, upload (straight to private storage, checked by the server) or
// replace, and remove. The chosen image's address goes into a normal form field, so it is saved with the form.
export default function ImageField({ name, label, value = "", hint, ratio = "16 / 7", expect }: { name: string; label: string; value?: string; hint?: string; ratio?: string; expect?: { width: number; height: number } }) {
  const picker = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(value);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const changed = url !== value;
  const [dims, setDims] = useState<{ width: number; height: number; url: string } | null>(null);

  async function post(body: object) {
    const response = await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Upload failed. Try again.");
    return result;
  }
  async function upload(file: File) {
    setError(""); setStatus("");
    if (file.size > MAX) { setError(`That image is ${(file.size / 1048576).toFixed(1)} MB. The limit is 5 MB.`); return; }
    if (!TYPES.includes(file.type)) { setError("Choose a JPEG, PNG or WebP image."); return; }
    setBusy(true);
    try {
      let sending = true;
      const ticket = await post({ action: "ticket" });
      await put(ticket.pathname, file, { access: "private", token: ticket.token, contentType: file.type,
        onUploadProgress: ({ percentage }) => { if (sending) setStatus(`Uploading ${Math.round(percentage)}%`); } });
      sending = false; // a late, throttled progress event must not overwrite the messages below
      setStatus("Checking the image...");
      const { url: saved } = await post({ action: "finalize", pathname: ticket.pathname });
      setUrl(saved);
      setStatus("Image ready. Save to put it live.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); setStatus(""); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-2 text-sm">
    <span>{label}</span>
    <input type="hidden" name={name} value={url} />
    <div className="relative overflow-hidden rounded-2 border border-line bg-bg-2" style={{ aspectRatio: ratio }}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" onLoad={(e) => setDims({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight, url })} />
        : <span className="grid h-full w-full place-items-center text-ink-soft"><span className="grid justify-items-center gap-1"><ImageUp size={22} aria-hidden="true" />No image yet</span></span>}
      {url && <button type="button" onClick={() => { setUrl(""); setStatus("Image removed. Save to apply."); }} disabled={busy}
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink shadow" aria-label={`Remove ${label.toLowerCase()}`}><X size={16} aria-hidden="true" /></button>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-ghost min-h-10 px-4 py-2 text-sm" disabled={busy} onClick={() => picker.current?.click()}>
        {url ? <RefreshCw size={15} aria-hidden="true" /> : <ImageUp size={15} aria-hidden="true" />}{busy ? "Uploading..." : url ? "Replace image" : "Upload image"}</button>
      <details className="text-xs text-ink-soft"><summary className="cursor-pointer">or paste an address</summary>
        <input value={url} onChange={(e) => setUrl(e.target.value.trim())} maxLength={2000} placeholder="/assets/... or https://..." className="field-input mt-1 w-72 max-w-full" aria-label={`${label} address`} /></details>
    </div>
    <input ref={picker} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept={TYPES.join(",")} disabled={busy}
      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload(file); }} />
    <span className="text-xs text-ink-soft">{hint ?? "JPEG, PNG or WebP, up to 5 MB."}</span>
    {expect && url && dims?.url === url && dims.width > 0 && <SizeNote dims={dims} expect={expect} />}
    {status && <p className={`text-[13px] ${changed ? "text-brand" : "text-ink-soft"}`} role="status">{status}</p>}
    {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
  </div>;
}

// Compares the chosen image with the section's size: a different shape is cropped to fit; a smaller one may look soft.
// SVG artwork scales cleanly and browsers do not report a reliable size for it, so it is not checked.
function SizeNote({ dims, expect }: { dims: { width: number; height: number; url: string }; expect: { width: number; height: number } }) {
  if (/\.svg($|\?)/i.test(dims.url)) return null;
  const off = Math.abs(dims.width / dims.height - expect.width / expect.height) / (expect.width / expect.height);
  const small = dims.width < expect.width * 0.75;
  if (off <= 0.05 && !small) return <p className="text-[13px] text-brand">Image is {dims.width} × {dims.height} px: a good fit for this section.</p>;
  return <p className="text-[13px] text-gold">Image is {dims.width} × {dims.height} px; this section is {expect.width} × {expect.height} px.
    {off > 0.05 ? " The shape differs, so the image will be cropped to fit." : ""}{small ? " It is smaller than recommended and may look soft on large screens." : ""}</p>;
}
