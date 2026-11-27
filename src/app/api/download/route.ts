import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { get } from "@vercel/blob";
import { sql, getOrder } from "@/lib/db";
import { verifyDownloadToken, licenceId } from "@/lib/token";
import { canAccessOrder } from "@/lib/reader-auth";
import { stampPdf } from "@/lib/pdf";
import { env } from "@/lib/env";
import { FILE_TYPES, normaliseFileType } from "@/lib/file-types";
import { buildZip } from "@/lib/zip";

export const runtime = "nodejs";
const MAX_DOWNLOADS = 10;
const MAX_BYTES = 64 * 1024 * 1024;
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
class DeliveryError extends Error { constructor(message: string, public status: number) { super(message); } }

const isSha = (value: unknown): value is string => typeof value === "string" && value.length === 64 && /^[a-f0-9]{64}$/i.test(value);
const sha256 = (bytes: Uint8Array) => crypto.createHash("sha256").update(bytes).digest("hex");

// The bytes of one purchased file, from the files shipped with the site, private storage or an approved host.
async function readSnapshot(fileUrl: string): Promise<Uint8Array> {
  if (fileUrl.startsWith("private:")) {
    const name = fileUrl.slice(8);
    if (!name || name !== path.basename(name) || /[\\/:\x00]/.test(name)) throw new DeliveryError("Invalid file reference.", 503);
    const dir = await realpath(path.join(process.cwd(), "private", "books"));
    const full = await realpath(path.join(dir, name));
    if (!full.startsWith(dir + path.sep)) throw new DeliveryError("Invalid file reference.", 503);
    const bytes = await readFile(full);
    if (bytes.length > MAX_BYTES) throw new DeliveryError("Purchased file exceeds supported size.", 503);
    return bytes;
  }
  const url = new URL(fileUrl);
  const allowed = (process.env.BOOK_STORAGE_ALLOWED_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const privateBlob = /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      (!privateBlob && !allowed.includes(url.hostname.toLowerCase())) ||
      (privateBlob && !env("BLOB_READ_WRITE_TOKEN")))
    throw new DeliveryError("File storage is not approved.", 503);
  let stream: ReadableStream<Uint8Array>;
  if (privateBlob) {
    const result = await get(url.href, { access: "private", useCache: false, abortSignal: AbortSignal.timeout(30000) });
    if (!result || result.statusCode !== 200 || result.blob.size > MAX_BYTES) throw new DeliveryError("Could not fetch the file.", 502);
    stream = result.stream;
  } else {
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body || Number(response.headers.get("content-length") || 0) > MAX_BYTES)
      throw new DeliveryError("Could not fetch the file.", 502);
    stream = response.body;
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > MAX_BYTES) throw new Error("File too large");
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks, length);
}

export async function GET(req: Request) {
  try {
    const claim = verifyDownloadToken(new URL(req.url).searchParams.get("t") || "");
    if (!claim) return reply("This link has expired. Reopen your order page for a fresh one.", 403);
    const order = await getOrder(claim.orderId);
    if (!order || !await canAccessOrder(order)) return reply("Order access denied.", 403);
    if (order.status !== "paid" && order.status !== "fulfilled") return reply("Order is not available.", 403);
    const item = order.items.find(i => i.slug === claim.slug);
    if (!item) return reply("Not part of this order.", 403);
    const access = await sql`select 1 from downloads where order_id=${order.id} and book_slug=${claim.slug}
      and revoked_at is null and count>=0 and count<${MAX_DOWNLOADS}`;
    if (!access.length) return reply('Download entitlement is unavailable or its limit was reached.', 429);
    let bytes: Uint8Array;
    let contentType: string, filename: string;
    if (Array.isArray(item.includes) && item.includes.length) {
      // A bundle: one ZIP made now from the files it included when it was bought, each checked against its own checksum.
      const files: { name: string; bytes: Uint8Array }[] = [];
      let total = 0;
      for (const part of item.includes) {
        const type = normaliseFileType(part.file_format);
        if (!part.file_url || !isSha(part.file_sha256) || !type) throw new DeliveryError("A file in this bundle has no integrity snapshot. Please contact support.", 503);
        let file = await readSnapshot(part.file_url);
        if (!file.length) throw new DeliveryError("Purchased file is empty.", 503);
        if (sha256(file) !== part.file_sha256.toLowerCase()) throw new DeliveryError("Purchased file integrity verification failed. Please contact support.", 503);
        if (FILE_TYPES[type].watermark) file = await stampPdf(file, `Personal licence ${licenceId(order.id, part.slug)}`);
        total += file.length;
        if (total > MAX_BYTES) throw new DeliveryError("Purchased bundle exceeds supported size.", 503);
        files.push({ name: part.name, bytes: file });
      }
      bytes = buildZip(files);
      contentType = FILE_TYPES.zip.contentType; filename = `${claim.slug}.zip`;
    } else {
      // Older orders without a snapshot require an explicit migration, never today's catalogue file.
      if (!item.file_url) return reply("Purchased file snapshot is unavailable. Please contact support.", 503);
      if (!isSha(item.file_sha256)) return reply("Purchased file integrity snapshot is unavailable. Please contact support.", 503);
      const format = normaliseFileType(item.file_format);
      if (!format) return reply("Unsupported purchased file format.", 503);
      bytes = await readSnapshot(item.file_url);
      if (!bytes.length) return reply("Purchased file is empty.", 503);
      if (sha256(bytes) !== item.file_sha256.toLowerCase()) return reply("Purchased file integrity verification failed. Please contact support.", 503);
      if (FILE_TYPES[format].watermark) bytes = await stampPdf(bytes, `Personal licence ${licenceId(order.id, claim.slug)}`);
      contentType = FILE_TYPES[format].contentType; filename = `${claim.slug}.${format}`;
    }
    // Serialize against refunds on the order row and consume only an existing, active entitlement.
    const reserved = await sql`
      with eligible as (
        select id from orders where id = ${order.id} and status in ('paid','fulfilled') for update
      )
      update downloads d set count = d.count + 1, last_at = now()
      where d.order_id in (select id from eligible) and d.book_slug = ${claim.slug}
        and d.revoked_at is null and d.count >= 0 and d.count < ${MAX_DOWNLOADS}
      returning d.count
    ` as { count: number }[];
    if (!reserved.length) return reply("Download entitlement is unavailable or its limit was reached.", 429);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof DeliveryError) return reply(error.message, error.status);
    console.error('[download] delivery failed');
    try { await sql`insert into events(type,payload) values('download.failed','{}'::jsonb)`; } catch {}
    return reply("Could not prepare your licensed file. Please retry.", 503);
  }
}
