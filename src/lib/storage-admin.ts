import { list, del } from "@vercel/blob";
import { sql } from "@/lib/db";
import { pathsIn, releasePaths, type BlobApi } from "@/lib/storage";

// Server-side glue between the pure storage rules (storage.ts) and the real database and Blob store.
export const blobApi = (token: string): BlobApi => ({
  list: (options) => list({ ...options, token }),
  del: (urls) => del(urls, { token }),
});

/** Managed upload paths mentioned in some rows, read BEFORE a change so they can be released AFTER it. */
export async function pathsBefore(query: Promise<unknown[]>): Promise<string[]> {
  try { return (await query as { doc?: string }[]).flatMap((row) => pathsIn(row.doc)); } catch { return []; }
}
export const booksDocs = (slugs: string[]) => sql`select to_jsonb(t)::text as doc from books t where slug = any(${slugs}::text[])`;

/**
 * Removes uploads a change left behind (an old file after "Replace", the art of a deleted banner, ...), unless a
 * record still uses them. Never fails the save that triggered it: a leftover file is cleaned up later from Storage.
 */
export async function releaseQuietly(paths: string[]) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !paths.length) return 0;
  try { return await releasePaths(sql as never, blobApi(token), paths); }
  catch { console.error("[storage] could not remove replaced files"); return 0; }
}
