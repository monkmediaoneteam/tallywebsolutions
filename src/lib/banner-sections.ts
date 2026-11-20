// Banner sections: the admin decides where image banners appear, how they are laid out, how many show and at what
// size. Stored as content modules of type "banner-section" (no extra table); built-in defaults apply until edited.
// Client-safe: used by the storefront, Admin > Banners and the server checks.

export const POSITIONS = {
  "home-top-main": { page: "home", label: "Homepage top, main area" },
  "home-top-side": { page: "home", label: "Homepage top, column beside the main area" },
  "home-after-categories": { page: "home", label: "Homepage, after the categories" },
  "home-after-products": { page: "home", label: "Homepage, after the product rows" },
  "home-before-faq": { page: "home", label: "Homepage, above the questions" },
  "product-below-details": { page: "product", label: "Product pages, below the product details" },
  "product-below-tabs": { page: "product", label: "Product pages, below the description" },
  "listing-above-results": { page: "listing", label: "Search and category pages, above the results" },
} as const;
export type Position = keyof typeof POSITIONS;

export const LAYOUTS = {
  carousel: "Carousel: one image at a time, rotating",
  single: "Single image",
  grid: "Grid: images side by side",
  stack: "Stacked: images one above another",
} as const;
export type Layout = keyof typeof LAYOUTS;

export type BannerSection = {
  key: string; name: string; position: Position; layout: Layout;
  max: number; columns: number; width: number; height: number; mobileWidth: number; mobileHeight: number;
  autoplay: number; empty: "placeholder" | "hide"; fit: "cover" | "contain"; enabled: boolean; sort: number;
  id?: string; updatedAt?: string; builtIn: boolean;
};

const base = { columns: 1, autoplay: 0, fit: "cover", enabled: true, builtIn: true } as const;
// Template artwork in public/banners is 1920 × 600, so the hero uses that shape (16:5).
export const DEFAULT_SECTIONS: BannerSection[] = [
  { ...base, key: "hero", name: "Hero", position: "home-top-main", layout: "carousel", max: 8, width: 1920, height: 600, mobileWidth: 800, mobileHeight: 1000, autoplay: 7, empty: "placeholder", sort: 0 },
  { ...base, key: "side", name: "Side cards", position: "home-top-side", layout: "stack", max: 2, width: 900, height: 600, mobileWidth: 800, mobileHeight: 600, empty: "placeholder", sort: 10 },
  { ...base, key: "band", name: "Wide band", position: "home-before-faq", layout: "single", max: 1, width: 1920, height: 500, mobileWidth: 800, mobileHeight: 600, empty: "hide", sort: 20 },
  { ...base, key: "product", name: "Product page banner", position: "product-below-details", layout: "single", max: 1, width: 1920, height: 500, mobileWidth: 800, mobileHeight: 600, empty: "hide", sort: 30 },
  { ...base, key: "listing", name: "Search and category banner", position: "listing-above-results", layout: "single", max: 1, width: 1920, height: 500, mobileWidth: 800, mobileHeight: 600, empty: "hide", sort: 40 },
];

// What "placeholder when empty" shows: the store's own hero and product cards at the top, a plain frame elsewhere.
export const EMPTY_LABEL: Record<Position, string> = Object.fromEntries(Object.keys(POSITIONS).map((p) => [p,
  p === "home-top-main" ? "Show the store's built-in hero" : p === "home-top-side" ? "Show product cards (best deal, newest)" : "Show a plain frame"])) as Record<Position, string>;

// Ready-made sizes offered next to the width and height boxes (desktop and phone together).
export const SIZE_PRESETS = [
  { label: "Wide hero 16:5", width: 1920, height: 600, mobileWidth: 800, mobileHeight: 1000 },
  { label: "Hero 16:7", width: 1600, height: 700, mobileWidth: 800, mobileHeight: 1000 },
  { label: "Strip 4:1", width: 1600, height: 400, mobileWidth: 800, mobileHeight: 600 },
  { label: "Card 3:2", width: 900, height: 600, mobileWidth: 800, mobileHeight: 600 },
  { label: "Square", width: 1000, height: 1000, mobileWidth: 1000, mobileHeight: 1000 },
  { label: "Portrait 4:5", width: 800, height: 1000, mobileWidth: 800, mobileHeight: 1000 },
] as const;

// Keys that would clash with a screen address.
export const RESERVED_KEYS = ["new"];

// What an admin can choose for an empty section. At the top of the homepage the store has its own hero and product cards.
export const EMPTY_CHOICES: Record<Position, readonly (readonly ["placeholder" | "hide", string])[]> = Object.fromEntries(Object.keys(POSITIONS).map((p) => [p,
  [["placeholder", EMPTY_LABEL[p as Position]], ["hide", "Leave the space out"]]])) as never;

// Limits for every number an admin can set.
export const LIMITS = { max: [1, 12], columns: [1, 4], width: [200, 4000], height: [100, 4000], autoplay: [0, 60] } as const;

const int = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
};

// Banners placed before sections existed used these slot names.
const LEGACY: Record<string, string> = { "side-1": "side", "side-2": "side" };
export const sectionKeyOf = (placement: unknown) => {
  const v = typeof placement === "string" && placement ? placement : "hero";
  return LEGACY[v] ?? v;
};

type StoredModule = { id: string; title: string; sort: number; payload: Record<string, unknown>; updated_at?: string };

// One stored section row, read leniently: anything missing or out of range falls back to the default (or a safe value).
export function sectionFromModule(m: StoredModule): BannerSection {
  const p = m.payload ?? {};
  const key = typeof p.key === "string" ? p.key : m.id;
  const d = DEFAULT_SECTIONS.find((s) => s.key === key) ?? DEFAULT_SECTIONS[2];
  return {
    key, name: m.title || d.name, id: m.id, updatedAt: m.updated_at, sort: Number.isFinite(m.sort) ? m.sort : d.sort,
    position: (typeof p.position === "string" && p.position in POSITIONS ? p.position : d.position) as Position,
    layout: (typeof p.layout === "string" && p.layout in LAYOUTS ? p.layout : d.layout) as Layout,
    max: int(p.max, LIMITS.max, d.max), columns: int(p.columns, LIMITS.columns, d.columns),
    width: int(p.width, LIMITS.width, d.width), height: int(p.height, LIMITS.height, d.height),
    mobileWidth: int(p.mobile_width, LIMITS.width, d.mobileWidth), mobileHeight: int(p.mobile_height, LIMITS.height, d.mobileHeight),
    autoplay: int(p.autoplay, LIMITS.autoplay, d.autoplay), fit: p.fit === "contain" ? "contain" : "cover", empty: p.empty === "placeholder" || p.empty === "hide" ? p.empty : d.empty,
    enabled: p.enabled !== "off", builtIn: DEFAULT_SECTIONS.some((s) => s.key === key),
  };
}

// The sections in effect: built-in defaults, overridden by any saved row with the same key, plus admin-made ones.
export function mergeSections(modules: (StoredModule & { type: string })[]): BannerSection[] {
  const stored = modules.filter((m) => m.type === "banner-section").map(sectionFromModule);
  const byKey = new Map(DEFAULT_SECTIONS.map((s) => [s.key, s]));
  for (const s of stored) byKey.set(s.key, s);
  return [...byKey.values()].sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key));
}

export const ratio = (w: number, h: number) => `${w} / ${h}`;
export const sizeLabel = (w: number, h: number) => `${w} × ${h} px`;

// Stored instants are shown and entered in India time.
export function toIndiaInput(value: string | null) {
  if (!value) return "";
  const t = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
  if (!Number.isFinite(t)) return "";
  return new Date(t + 330 * 60000).toISOString().slice(0, 16);
}
