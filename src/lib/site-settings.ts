import { cache } from "react";
import { sql } from "./db";

export type SettingKey = "home_layout" | "theme";
type Rows = { key: string; value: unknown }[];

export const isMissingTable = (error: unknown) => !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01";

// Both settings in one query, once per request. A missing table (migration not applied yet) or any read problem
// means "no saved settings": the storefront then uses its defaults and never breaks.
export const getSiteSettings = cache(async (): Promise<Partial<Record<SettingKey, unknown>>> => {
  try {
    const rows = await sql`select key, value from site_settings where key in ('home_layout', 'theme')` as Rows;
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch (error) {
    if (!isMissingTable(error)) console.error("[site-settings] read failed", error instanceof Error ? error.message : error);
    return {};
  }
});

export async function saveSiteSetting(key: SettingKey, value: unknown) {
  await sql`insert into site_settings (key, value, updated_at) values (${key}, ${JSON.stringify(value)}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}
export async function deleteSiteSetting(key: SettingKey) {
  await sql`delete from site_settings where key = ${key}`;
}
// Admin read: unlike the storefront, a missing table is reported so the screen can say "apply the migration".
export async function readSiteSetting(key: SettingKey): Promise<{ value: unknown; missing: boolean }> {
  try {
    const rows = await sql`select value from site_settings where key = ${key}` as { value: unknown }[];
    return { value: rows[0]?.value ?? null, missing: false };
  } catch (error) {
    if (isMissingTable(error)) return { value: null, missing: true };
    throw error;
  }
}
