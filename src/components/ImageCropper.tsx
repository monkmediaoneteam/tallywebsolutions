"use client";

import Cropper, { type Area } from "react-easy-crop";
import { useEffect, useId, useRef, useState } from "react";

const MAX = 5 * 1024 * 1024;

// A native modal keeps focus inside the crop editor and restores it to the file button on close.
export default function ImageCropper({ file, size, onCancel, onComplete }: {
  file: File; size: { width: number; height: number }; onCancel: () => void; onComplete: (file: File) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [source, setSource] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // A bounded local data URL survives Strict Mode's effect teardown/replay.
    // Revoking a blob URL during that replay can race the cropper's image request.
    const reader = new FileReader();
    const img = new Image();
    img.onload = () => setImage(img);
    img.onerror = () => setError("That image could not be read. Choose another image.");
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setSource(reader.result);
      img.src = reader.result;
    };
    reader.onerror = () => setError("That image could not be read. Choose another image.");
    reader.readAsDataURL(file);
    dialog.current?.showModal();
    return () => {
      reader.onload = null; reader.onerror = null;
      if (reader.readyState === FileReader.LOADING) reader.abort();
      img.onload = null; img.onerror = null; img.removeAttribute("src"); previous?.focus();
    };
  }, [file]);
  const sameShape = image && Math.abs(image.naturalWidth * size.height - image.naturalHeight * size.width) <= Math.max(size.width, size.height);
  async function save() {
    if (!image || !area || busy) return;
    setBusy(true); setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = size.width; canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not create the crop.");
      context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size.width, size.height);
      const type = file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("The crop could not be exported.")), type, 0.9));
      if (blob.size > MAX) throw new Error("The cropped image exceeds 5 MB. Choose a smaller image or JPEG source.");
      onComplete(new File([blob], `banner-${size.width}x${size.height}.${type === "image/png" ? "png" : "jpg"}`, { type }));
    } catch (e) { setError(e instanceof Error ? e.message : "The crop could not be exported."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby={heading} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
    className="m-auto max-h-[95dvh] w-[min(95vw,720px)] overflow-auto rounded-xl border border-line bg-white p-5 text-ink backdrop:bg-black/60">
    <h2 id={heading} className="text-lg font-semibold">Crop banner image</h2>
    <p className="my-2 text-sm">Drag the image or use the arrow keys to position it. Output: {size.width} × {size.height} px.</p>
    <div className="relative h-[min(50dvh,400px)] overflow-hidden bg-black">
      {source && <Cropper image={source} crop={crop} zoom={zoom} aspect={size.width / size.height}
        onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)}
        keyboardStep={10} cropperProps={{ "aria-label": "Position banner crop with arrow keys", role: "group" }} />}
    </div>
    <label className="my-4 flex items-center gap-3">Zoom
      <input aria-label="Crop zoom" type="range" min={1} max={3} step={0.01} value={zoom} disabled={busy}
        onChange={(e) => setZoom(Number(e.target.value))} className="min-w-0 flex-1" />
    </label>
    {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-primary" disabled={!image || !area || busy} onClick={save}>{busy ? "Exporting…" : "Use crop"}</button>
      {sameShape && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onComplete(file)}>Skip crop</button>}
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </dialog>;
}
