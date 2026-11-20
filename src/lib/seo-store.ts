// Server-only by convention: reads and writes the seo_pages table.
import { cache } from "react";
import { sql } from "./db";
import { cleanStored, PAGE_FIELDS, SITE_FIELDS, type SeoData, type SiteSeo } from "./seo";

export type SeoRow = { path: string; data: unknown; updated_at: string };

/** Postgres "undefined_table": the migration has not been applied yet, so the storefront uses built-in defaults. */
export const isMissingTable = (error: unknown) => (error as { code?: string } | null)?.code === "42P01"
  || /relation "?seo_pages"? does not exist/i.test(String((error as { message?: string } | null)?.message ?? ""));

async function tolerant<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try { return await read(); }
  catch (error) {
    // A missing table is expected before the migration; any other failure must not take the storefront down either.
    if (!isMissingTable(error)) console.error("SEO overrides could not be read; using defaults.");
    return fallback;
  }
}

/** Every override row (the table only holds pages an admin customised). Used by the sitemap and the admin screen. */
export async function getSeoRows(): Promise<SeoRow[]> {
  return tolerant(async () => await sql`select path, data, updated_at from seo_pages` as SeoRow[], []);
}

export type PageSeo = { site: SiteSeo; override: SeoData };
/** One select for the page and the site defaults; cached so metadata and the page body share it within a request. */
export const getPageSeo = cache(async (path: string): Promise<PageSeo> => {
  const rows = await tolerant(async () => await sql`select path, data from seo_pages where path = ${path} or path = '*'` as SeoRow[], []);
  const site = rows.find((r) => r.path === "*");
  const page = path === "*" ? undefined : rows.find((r) => r.path === path);
  return { site: cleanStored(site?.data, SITE_FIELDS), override: cleanStored(page?.data, PAGE_FIELDS) };
});

export function indexRows(rows: SeoRow[]) {
  const overrides = new Map<string, SeoData>();
  let site: SiteSeo = {};
  for (const row of rows) {
    if (row.path === "*") site = cleanStored(row.data, SITE_FIELDS);
    else overrides.set(row.path, cleanStored(row.data, PAGE_FIELDS));
  }
  return { site, overrides };
}

/** Saves one page (or '*'); the audit event is written in the same statement. */
export async function saveSeo(path: string, data: SeoData | SiteSeo) {
  await sql`with saved as (
    insert into seo_pages(path, data) values(${path}, ${JSON.stringify(data)}::jsonb)
    on conflict (path) do update set data = excluded.data, updated_at = now() returning path
  ), audit as (insert into events(order_id, type, payload) select null, 'admin.seo.saved', jsonb_build_object('path', path) from saved)
  select path from saved`;
}
export async function resetSeo(path: string) {
  await sql`with removed as (delete from seo_pages where path = ${path} returning path
  ), audit as (insert into events(order_id, type, payload) select null, 'admin.seo.reset', jsonb_build_object('path', path) from removed)
  select path from removed`;
}
