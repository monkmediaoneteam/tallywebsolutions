// Keeps file storage from filling up with files nothing uses.
//
// The store keeps two kinds of uploads in a private Blob store:
//   admin/media/<uuid>                   images (banners, category art, ...), shown through /api/media/<uuid>
//   admin/books/<slug>/<uuid>-pdf|cover  product files and covers
// Replacing a file, deleting a banner or abandoning an upload used to leave the old file behind for good.
// Here a file counts as IN USE when any record still points at it, including the snapshot taken into an order when
// it was bought (customers must always be able to re-download what they paid for). Everything else is unused, and
// is removed when it is replaced or deleted, or when the admin runs "Delete unused files" on the Storage screen.
//
// Pure: the database and Blob store are passed in, so tests run without either.

type Sql = (parts: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;
export type StoredFile = { pathname: string; url: string; size: number; uploadedAt: Date };
export type BlobApi = {
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ blobs: { pathname: string; url: string; size: number; uploadedAt: Date | string }[]; cursor?: string; hasMore: boolean }>;
  del(urls: string[]): Promise<void>;
};

export const MANAGED_PREFIXES = ["admin/media/", "admin/books/"] as const;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PRODUCT_RE = new RegExp(`admin/books/[a-z0-9]+(?:-[a-z0-9]+)*/${UUID}-(?:pdf|cover)`, "g");
const MEDIA_RE = new RegExp(`/api/media/(${UUID})`, "g");
// Files uploaded less than this long ago may belong to a form that has not been saved yet.
export const GRACE_MS = 60 * 60 * 1000;

export type FileKind = "image" | "product" | "cover";
export const kindOf = (pathname: string): FileKind => (pathname.startsWith("admin/media/") ? "image" : pathname.endsWith("-cover") ? "cover" : "product");

/** Every managed file path mentioned anywhere in some text (a URL, a row, a JSON document). */
export function pathsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const m of text.matchAll(PRODUCT_RE)) found.add(m[0]);
  for (const m of text.matchAll(MEDIA_RE)) found.add(`admin/media/${m[1]}`);
  return [...found];
}

const missing = (error: unknown) => { const code = (error as { code?: string } | null)?.code; return code === "42P01" || code === "42703"; };

// Records that can point at an upload. `to_jsonb(row)::text` covers every column, including JSON payloads and the
// order item snapshots, so a new column or table of this kind does not need a code change.
const SCANS: ((sql: Sql) => Promise<Record<string, unknown>[]>)[] = [
  (sql) => sql`select to_jsonb(t)::text as doc from books t`,
  (sql) => sql`select items::text as doc from orders`,
  (sql) => sql`select to_jsonb(t)::text as doc from content_modules t`,
  (sql) => sql`select to_jsonb(t)::text as doc from content_collections t`,
  (sql) => sql`select to_jsonb(t)::text as doc from author_profiles t`,
  (sql) => sql`select to_jsonb(t)::text as doc from categories t`,
  (sql) => sql`select to_jsonb(t)::text as doc from site_settings t`,
  (sql) => sql`select to_jsonb(t)::text as doc from seo_pages t`,
];

/** Paths of every upload that some record still uses. Tables that do not exist yet are skipped. */
export async function usedPaths(sql: Sql): Promise<Set<string>> {
  const used = new Set<string>();
  for (const scan of SCANS) {
    let rows: Record<string, unknown>[] = [];
    try { rows = await scan(sql); } catch (error) { if (!missing(error)) throw error; }
    for (const row of rows) for (const p of pathsIn(String(row.doc ?? ""))) used.add(p);
  }
  return used;
}

/** All managed files in storage. */
export async function storedFiles(api: BlobApi): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  for (const prefix of MANAGED_PREFIXES) {
    let cursor: string | undefined;
    for (let page = 0; page < 200; page++) {
      const result = await api.list({ prefix, cursor, limit: 1000 });
      for (const b of result.blobs) files.push({ pathname: b.pathname, url: b.url, size: b.size, uploadedAt: new Date(b.uploadedAt) });
      if (!result.hasMore || !result.cursor) break;
      cursor = result.cursor;
    }
  }
  return files;
}

export type Usage = { total: { files: number; bytes: number }; byKind: Record<FileKind, { files: number; bytes: number }>; unused: StoredFile[]; recent: number; unusedBytes: number };

/** What is stored, what is used, and what could be removed now (unused and past the grace period). */
export async function storageReport(sql: Sql, api: BlobApi, now = Date.now()): Promise<Usage> {
  const [files, used] = await Promise.all([storedFiles(api), usedPaths(sql)]);
  const byKind: Usage["byKind"] = { image: { files: 0, bytes: 0 }, product: { files: 0, bytes: 0 }, cover: { files: 0, bytes: 0 } };
  const unused: StoredFile[] = [];
  let recent = 0;
  for (const f of files) {
    const k = byKind[kindOf(f.pathname)];
    k.files += 1; k.bytes += f.size;
    if (used.has(f.pathname)) continue;
    if (now - f.uploadedAt.getTime() < GRACE_MS) recent += 1; else unused.push(f);
  }
  unused.sort((a, b) => b.size - a.size);
  return { total: { files: files.length, bytes: files.reduce((s, f) => s + f.size, 0) }, byKind, unused, recent, unusedBytes: unused.reduce((s, f) => s + f.size, 0) };
}

/** Deletes every unused file past the grace period. Returns what was removed. */
export async function deleteUnused(sql: Sql, api: BlobApi, now = Date.now()): Promise<{ deleted: number; bytes: number }> {
  const { unused } = await storageReport(sql, api, now);
  for (let i = 0; i < unused.length; i += 100) await api.del(unused.slice(i, i + 100).map((f) => f.url));
  return { deleted: unused.length, bytes: unused.reduce((s, f) => s + f.size, 0) };
}

/**
 * After a replace or delete: removes just these files if nothing uses them any more (no grace period: the admin
 * just replaced them on purpose). Files still referenced, for example by an order, are kept.
 */
export async function releasePaths(sql: Sql, api: BlobApi, candidates: Iterable<string>): Promise<number> {
  const wanted = new Set([...candidates].filter((p) => MANAGED_PREFIXES.some((prefix) => p.startsWith(prefix))));
  if (!wanted.size) return 0;
  const used = await usedPaths(sql);
  const gone = [...wanted].filter((p) => !used.has(p));
  if (!gone.length) return 0;
  // Delete by pathname: the Blob client resolves it within the connected store.
  await api.del(gone);
  return gone.length;
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
