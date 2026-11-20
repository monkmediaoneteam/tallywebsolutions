import type { Metadata } from "next";
import { STORE, siteUrl } from "./store";
import { jsonLdHtml, resolveSeo, toMetadata, type PageDefaults, type StoreInfo } from "./seo";
import { getPageSeo } from "./seo-store";
import { staticDefaults } from "./seo-pages";

export const storeInfo = (): StoreInfo => ({ name: STORE.name, tagline: STORE.tagline, url: siteUrl() });

/** Metadata for a page: its built-in defaults, then the site defaults, then the admin's override for that path. */
export async function seoMetadata(path: string, defaults?: PageDefaults): Promise<Metadata> {
  const store = storeInfo();
  const { site, override } = await getPageSeo(path);
  return toMetadata(resolveSeo({ path, defaults: defaults ?? staticDefaults(path), site, override, store }), store);
}

/** Custom structured data (and the og:type Next cannot print) for a page. The page's own JSON-LD stays where it is. */
export async function SeoHead({ path, defaults, site: withSite = false }: { path: string; defaults?: PageDefaults; site?: boolean }) {
  const { site, override } = await getPageSeo(path);
  const sources = [withSite ? site.jsonLd : "", override.jsonLd].filter((s): s is string => !!s);
  const ogType = override.ogType || (defaults ?? safeDefaults(path))?.ogType;
  return <>
    {sources.map((source, i) => { const html = jsonLdHtml(source); return html ? <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: html }} /> : null; })}
    {ogType === "product" && <meta property="og:type" content="product" />}
  </>;
}
function safeDefaults(path: string) { try { return staticDefaults(path); } catch { return undefined; } }
