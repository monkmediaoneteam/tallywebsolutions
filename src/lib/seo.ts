/**
 * Page-wise SEO: pure helpers shared by the admin SEO manager (client) and the storefront (server).
 * No database, no Node-only imports. Precedence for a page: built-in page defaults < site defaults < page override.
 * Exceptions that keep the result sensible: a page that is noindex by default stays noindex, and a page-specific
 * default image (a product cover) beats the generic site image.
 */

export const PAGE_FIELDS = ["title", "description", "keywords", "focusKeyword", "canonical", "robots", "ogTitle", "ogType", "ogDescription", "ogImage",
  "twitterCard", "twitterTitle", "twitterDescription", "twitterImage", "sitemapExclude", "sitemapPriority", "sitemapChangefreq", "jsonLd"] as const;
export const SITE_FIELDS = ["siteName", "titleTemplate", "description", "ogImage", "robots", "twitterCard", "jsonLd"] as const;
export type PageField = typeof PAGE_FIELDS[number];
export type SiteField = typeof SITE_FIELDS[number];
export type SeoData = Partial<Record<PageField, string>>;
export type SiteSeo = Partial<Record<SiteField, string>>;
export type StoreInfo = { name: string; tagline: string; url: string };
export type PageDefaults = {
  title: string;
  /** The title is already complete (home page); the site title template is not applied. */
  fullTitle?: boolean;
  description?: string;
  canonical?: string;
  robots?: string;
  ogType?: string;
  ogImage?: string;
  /** The page already prints its own structured data (a product page). */
  hasJsonLd?: boolean;
};

export const GROUPS = ["Core pages", "Categories", "Products", "Policies", "Account & checkout"] as const;
export type Group = typeof GROUPS[number];
export const OG_TYPES = ["website", "article", "product"] as const;
export const TWITTER_CARDS = ["summary_large_image", "summary"] as const;
export const PRIORITIES = ["1.0", "0.9", "0.8", "0.7", "0.6", "0.5", "0.4", "0.3", "0.2", "0.1"] as const;
export const CHANGE_FREQS = ["daily", "weekly", "monthly", "yearly"] as const;
export const ROBOTS_PRESETS = ["index, follow", "index, follow, max-image-preview:large", "noindex, follow", "noindex, nofollow"] as const;
export const MAX_JSON_LD_BYTES = 20 * 1024;
export const LIMITS = { title: 120, description: 320, keywords: 300, focusKeyword: 100, url: 500, siteName: 80, template: 120 };
/** Next.js prints og:type only for these; a product type is printed by <SeoHead> instead. */
export const NEXT_OG_TYPES = ["website", "article", "book", "profile"];

export class SeoError extends Error {}

const ROBOTS_TOKEN = /^(index|noindex|follow|nofollow|noarchive|nosnippet|noimageindex|notranslate|max-image-preview:(none|standard|large)|max-snippet:-?\d{1,6}|max-video-preview:-?\d{1,6})$/;

/** Normalises and checks a robots meta value; every token must be a known directive. */
export function parseRobots(value: string): string {
  const tokens = value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length > 8) throw new SeoError("Robots meta has too many directives.");
  for (const t of tokens) if (!ROBOTS_TOKEN.test(t)) throw new SeoError(`Robots meta: "${t.slice(0, 40)}" is not an allowed directive.`);
  const unique = [...new Set(tokens)];
  if (unique.includes("index") && unique.includes("noindex")) throw new SeoError("Robots meta cannot be both index and noindex.");
  if (unique.includes("follow") && unique.includes("nofollow")) throw new SeoError("Robots meta cannot be both follow and nofollow.");
  return unique.join(", ");
}
export const isNoindex = (robots: string) => /(^|[\s,])noindex($|[\s,])/i.test(robots);

function httpsUrl(label: string, value: string): string {
  if (!value) return "";
  if (value.length > LIMITS.url || /[\s\\\x00-\x1f"<>]/.test(value)) throw new SeoError(`${label} is not a valid address.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new SeoError(`${label} must be a full https:// address.`); }
  if (url.protocol !== "https:" || url.username || url.password) throw new SeoError(`${label} must be a full https:// address.`);
  return value;
}
/** An https address, or an uploaded image served from /api/media/. */
function imageUrl(label: string, value: string): string {
  if (!value) return "";
  if (/^\/api\/media\/[0-9a-f-]{36}$/.test(value)) return value;
  return httpsUrl(label, value);
}
function text(label: string, value: unknown, max: number): string {
  if (value == null) return "";
  if (typeof value !== "string") throw new SeoError(`${label} is not valid.`);
  const v = value.replace(/\s+/g, " ").trim();
  if (v.length > max) throw new SeoError(`${label} can be at most ${max} characters.`);
  return v;
}
function oneOf<T extends string>(label: string, value: unknown, allowed: readonly T[]): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (v && !allowed.includes(v as T)) throw new SeoError(`${label} is not an allowed choice.`);
  return v;
}
/** JSON-LD must parse, be an object or array, and stay small. The text is kept as typed. */
export function parseJsonLd(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string") throw new SeoError("JSON-LD is not valid.");
  const v = value.trim();
  if (!v) return "";
  if (new TextEncoder().encode(v).length > MAX_JSON_LD_BYTES) throw new SeoError("JSON-LD can be at most 20 KB.");
  let parsed: unknown;
  try { parsed = JSON.parse(v); } catch { throw new SeoError("JSON-LD is not valid JSON."); }
  if (parsed === null || typeof parsed !== "object") throw new SeoError("JSON-LD must be a JSON object or array.");
  return v;
}

function compact<T extends Record<string, string | undefined>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as T;
}
/** Whitelists and validates one page's SEO fields. Empty values are dropped: empty means "use the default". */
export function parsePageSeo(input: Record<string, unknown>): SeoData {
  const g = (key: string) => input[key];
  return compact({
    title: text("Title tag", g("title"), LIMITS.title),
    description: text("Meta description", g("description"), LIMITS.description),
    keywords: text("Keywords", g("keywords"), LIMITS.keywords),
    focusKeyword: text("Focus keyword", g("focusKeyword"), LIMITS.focusKeyword),
    canonical: httpsUrl("Canonical URL", text("Canonical URL", g("canonical"), LIMITS.url)),
    robots: parseRobots(text("Robots meta", g("robots"), 200)),
    ogTitle: text("OG title", g("ogTitle"), LIMITS.title),
    ogType: oneOf("OG type", g("ogType"), OG_TYPES),
    ogDescription: text("OG description", g("ogDescription"), LIMITS.description),
    ogImage: imageUrl("OG image", text("OG image", g("ogImage"), LIMITS.url)),
    twitterCard: oneOf("Twitter card", g("twitterCard"), TWITTER_CARDS),
    twitterTitle: text("Twitter title", g("twitterTitle"), LIMITS.title),
    twitterDescription: text("Twitter description", g("twitterDescription"), LIMITS.description),
    twitterImage: imageUrl("Twitter image", text("Twitter image", g("twitterImage"), LIMITS.url)),
    sitemapExclude: oneOf("Include in sitemap", g("sitemapExclude"), ["yes"] as const),
    sitemapPriority: oneOf("Priority", g("sitemapPriority"), PRIORITIES),
    sitemapChangefreq: oneOf("Change frequency", g("sitemapChangefreq"), CHANGE_FREQS),
    jsonLd: parseJsonLd(g("jsonLd")),
  }) as SeoData;
}
export function parseSiteSeo(input: Record<string, unknown>): SiteSeo {
  const g = (key: string) => input[key];
  const template = text("Title template", g("titleTemplate"), LIMITS.template);
  if (template && !template.includes("%s")) throw new SeoError("The title template must contain %s, where the page title goes.");
  return compact({
    siteName: text("Site name", g("siteName"), LIMITS.siteName),
    titleTemplate: template,
    description: text("Default description", g("description"), LIMITS.description),
    ogImage: imageUrl("Default social image", text("Default social image", g("ogImage"), LIMITS.url)),
    robots: parseRobots(text("Default robots", g("robots"), 200)),
    twitterCard: oneOf("Twitter card", g("twitterCard"), TWITTER_CARDS),
    jsonLd: parseJsonLd(g("jsonLd")),
  }) as SiteSeo;
}
/** Paths the manager may store: '*' (site defaults) or a site path. */
export const isSeoPath = (path: unknown): path is string =>
  typeof path === "string" && (path === "*" || (path.length <= 220 && /^\/[A-Za-z0-9\-._~%\/]*$/.test(path) && !path.includes("//")));

/** Keeps only string values of known keys from stored JSON, so a damaged row can never inject anything. */
export function cleanStored<K extends string>(raw: unknown, keys: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  if (raw && typeof raw === "object") for (const k of keys) { const v = (raw as Record<string, unknown>)[k]; if (typeof v === "string" && v) out[k] = v; }
  return out;
}

export const applyTemplate = (template: string, title: string) => template.replace("%s", () => title);
export const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;
export const pagePath = (path: string) => path === "/" || path === "*" ? "" : path;

export type Resolved = {
  title: string; description: string; keywords: string; focusKeyword: string; canonical: string; robots: string; noindex: boolean;
  ogTitle: string; ogType: string; ogDescription: string; ogImage: string;
  twitterCard: string; twitterTitle: string; twitterDescription: string; twitterImage: string;
  sitemapInclude: boolean; sitemapPriority?: number; sitemapChangefreq?: string;
  siteName: string; titleTemplate: string;
};

/** The values a page really outputs. `override` may hold unsaved form values (the manager previews them live). */
export function resolveSeo(args: { path: string; defaults: PageDefaults; site?: SiteSeo; override?: SeoData; store: StoreInfo }): Resolved {
  const { path, defaults, site = {}, override = {}, store } = args;
  const siteName = site.siteName || store.name;
  const titleTemplate = site.titleTemplate || `%s | ${siteName}`;
  const title = override.title || (defaults.fullTitle ? defaults.title : applyTemplate(titleTemplate, defaults.title));
  const description = override.description || defaults.description || site.description || store.tagline;
  const canonical = override.canonical || defaults.canonical || `${store.url}${pagePath(path)}`;
  const robots = override.robots || defaults.robots || site.robots || "index, follow";
  const ogTitle = override.ogTitle || title;
  const ogDescription = override.ogDescription || description;
  const ogImage = override.ogImage || defaults.ogImage || site.ogImage || "";
  return {
    title, description, keywords: override.keywords || "", focusKeyword: override.focusKeyword || "", canonical, robots, noindex: isNoindex(robots),
    ogTitle, ogType: override.ogType || defaults.ogType || "website", ogDescription, ogImage,
    twitterCard: override.twitterCard || site.twitterCard || "summary_large_image",
    twitterTitle: override.twitterTitle || ogTitle, twitterDescription: override.twitterDescription || ogDescription,
    twitterImage: override.twitterImage || ogImage,
    sitemapInclude: override.sitemapExclude !== "yes" && !isNoindex(robots),
    sitemapPriority: override.sitemapPriority ? Number(override.sitemapPriority) : undefined,
    sitemapChangefreq: override.sitemapChangefreq || undefined,
    siteName, titleTemplate,
  };
}

const absolute = (url: string, base: string) => !url ? "" : /^https?:\/\//i.test(url) ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`;

/** A Next.js Metadata object. (Typed loosely on purpose: this file stays free of framework imports.) */
export function toMetadata(r: Resolved, store: StoreInfo) {
  const images = (url: string) => [absolute(url, store.url)];
  const keywords = r.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  return {
    title: { absolute: r.title },
    description: r.description,
    ...(keywords.length ? { keywords } : {}),
    alternates: { canonical: r.canonical },
    robots: r.robots,
    openGraph: { title: r.ogTitle, description: r.ogDescription, siteName: r.siteName, url: r.canonical,
      ...(NEXT_OG_TYPES.includes(r.ogType) ? { type: r.ogType } : {}), ...(r.ogImage ? { images: images(r.ogImage) } : {}) },
    twitter: { card: r.twitterCard, title: r.twitterTitle, description: r.twitterDescription, ...(r.twitterImage ? { images: images(r.twitterImage) } : {}) },
  } as import("next").Metadata;
}

/** One sitemap row, or null when the page is left out (by choice or because it is noindex). */
export function sitemapRow(path: string, r: Resolved, store: StoreInfo, fallbackPriority: number) {
  if (!r.sitemapInclude) return null;
  return { url: `${store.url}${pagePath(path)}`, lastModified: new Date(), priority: r.sitemapPriority ?? fallbackPriority,
    ...(r.sitemapChangefreq ? { changeFrequency: r.sitemapChangefreq as "daily" | "weekly" | "monthly" | "yearly" } : {}) };
}

/** Script-tag-safe JSON: `<` and friends are escaped so stored text can never close the tag. Invalid JSON gives null. */
const UNSAFE = new RegExp("[<>&" + String.fromCharCode(0x2028, 0x2029) + "]", "g");
export function jsonLdHtml(source: string): string | null {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { return null; }
  if (parsed === null || typeof parsed !== "object") return null;
  return JSON.stringify(parsed).replace(UNSAFE, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

export type Check = { ok: boolean; label: string };
/** The checklist beside the SERP preview. `form` holds what the admin has typed; `r` the resolved values. */
export function seoChecks(r: Resolved, form: SeoData, defaults: Pick<PageDefaults, "hasJsonLd">): Check[] {
  const keyword = r.focusKeyword.toLowerCase();
  let valid = true;
  if (form.jsonLd) { try { const p = JSON.parse(form.jsonLd); valid = p !== null && typeof p === "object"; } catch { valid = false; } }
  const present = !!form.jsonLd || !!defaults.hasJsonLd;
  return [
    { ok: r.title.length >= 30 && r.title.length <= 60, label: "Title is 30 to 60 characters" },
    { ok: r.description.length >= 120 && r.description.length <= 160, label: "Meta description is 120 to 160 characters" },
    { ok: !!keyword, label: "Focus keyword is set" },
    { ok: !!keyword && r.title.toLowerCase().includes(keyword), label: "Focus keyword appears in the title" },
    { ok: !!keyword && r.description.toLowerCase().includes(keyword), label: "Focus keyword appears in the description" },
    { ok: /^https:\/\//.test(r.canonical), label: "Canonical URL is an absolute https URL" },
    { ok: !r.noindex, label: "Page can be indexed" },
    { ok: !!(r.ogImage || r.twitterImage), label: "Social share image is set" },
    { ok: present && valid, label: form.jsonLd && !valid ? "JSON-LD is not valid JSON" : "Structured data (JSON-LD) is present" },
  ];
}

export type TemplateContext = { store: StoreInfo; path: string; label: string; title: string; description: string; canonical: string; image: string };
export const TEMPLATE_TYPES = ["Organization", "WebSite", "WebPage", "SoftwareApplication", "BreadcrumbList", "FAQPage", "Article"] as const;
export type TemplateType = typeof TEMPLATE_TYPES[number];

/** Starter structured data built from the store name and address. The admin edits it before saving. */
export function jsonLdTemplate(type: TemplateType, c: TemplateContext): string {
  const { store } = c;
  const org = { "@type": "Organization", name: store.name, url: store.url };
  const templates: Record<TemplateType, Record<string, unknown>> = {
    Organization: { ...org, description: store.tagline, sameAs: [] },
    WebSite: { "@type": "WebSite", name: store.name, url: store.url, potentialAction: { "@type": "SearchAction", target: `${store.url}/search?q={search_term_string}`, "query-input": "required name=search_term_string" } },
    WebPage: { "@type": "WebPage", name: c.title || c.label, description: c.description, url: c.canonical, isPartOf: { "@type": "WebSite", name: store.name, url: store.url }, publisher: org },
    SoftwareApplication: { "@type": "SoftwareApplication", name: c.label, description: c.description, url: c.canonical, applicationCategory: "BusinessApplication", operatingSystem: "Windows",
      ...(c.image ? { image: absolute(c.image, store.url) } : {}), offers: { "@type": "Offer", price: "0", priceCurrency: "INR", availability: "https://schema.org/InStock", url: c.canonical }, publisher: org },
    BreadcrumbList: { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${store.url}/` },
      ...(c.path === "/" || c.path === "*" ? [] : [{ "@type": "ListItem", position: 2, name: c.label, item: c.canonical }])] },
    FAQPage: { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Question?", acceptedAnswer: { "@type": "Answer", text: "Answer." } }] },
    Article: { "@type": "Article", headline: c.title || c.label, description: c.description, ...(c.image ? { image: absolute(c.image, store.url) } : {}),
      author: org, publisher: org, datePublished: new Date().toISOString().slice(0, 10), mainEntityOfPage: c.canonical },
  };
  return JSON.stringify({ "@context": "https://schema.org", ...templates[type] }, null, 2);
}
