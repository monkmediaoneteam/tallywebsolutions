// Homepage sections: a typed registry (Shopify-style). Every section on the homepage is an instance of a TYPE;
// each type has a SCHEMA of grouped settings, and that one schema drives the admin form, the server-side
// validation and the storefront defaults. Client-safe: no database, used by the storefront, Admin > Homepage
// sections and the offline tests. Adding a type is adding one object to SECTION_TYPES.
import { POSITIONS } from "./banner-sections";

export type Value = string | number | boolean;
export type Option = readonly [value: string, label: string];
export type FieldType = "text" | "textarea" | "select" | "range" | "checkbox" | "color" | "url" | "image" | "position";
export type FieldDef = {
  id: string; type: FieldType; label: string; group: string; default: Value;
  options?: readonly Option[]; min?: number; max?: number; step?: number; unit?: string; help?: string; placeholder?: string;
  maxLength?: number; expect?: { width: number; height: number };
  /** Show this field only while another field has (is) or has not (not) one of these values. */
  showWhen?: { id: string; is?: readonly Value[]; not?: readonly Value[] };
};
export type BlockDef = { label: string; itemLabel: string; max: number; titleField: string; fields: FieldDef[]; defaults?: Record<string, Value>[] };
export type SectionType = {
  id: string; label: string; description: string;
  /** Where the "Add section" menu lists it. */
  category: "Store sections" | "Banners" | "Content";
  singleton: boolean; removable: boolean;
  fields: FieldDef[]; blocks?: BlockDef;
  /** One line shown in the list: the heading, or what the section is. */
  summary?: (s: Settings, blocks: Block[]) => string;
};
export type Settings = Record<string, Value>;
export type Block = { id: string; settings: Settings };
export type StoredSection = { id: string; type: string; enabled: boolean; settings: Settings; blocks?: Block[] };
export type ResolvedSection = { id: string; type: string; enabled: boolean; settings: Settings; blocks: Block[] };
export type Layout = { version: 1; sections: StoredSection[] };

export const MAX_SECTIONS = 40;
export const GROUPS = ["Content", "Layout", "Mobile", "Image", "Colours", "Section"] as const;

export class SectionError extends Error {}

// ---------------------------------------------------------------- shared option lists
const HEIGHTS: readonly Option[] = [["400px", "400 px"], ["500px", "500 px"], ["600px", "600 px"], ["700px", "700 px"], ["800px", "800 px"], ["900px", "900 px"], ["100vh", "Full screen height"], ["adapt", "Adapt to the image"]];
const MOBILE_HEIGHTS: readonly Option[] = [["auto", "Auto"], ["200px", "200 px"], ["300px", "300 px"], ["400px", "400 px"], ["500px", "500 px"], ["600px", "600 px"]];
const SIZES: readonly Option[] = [["small", "Small"], ["medium", "Medium"], ["large", "Large"]];
const ALIGNS: readonly Option[] = [["left", "Left"], ["center", "Centre"], ["right", "Right"]];
export const POSITIONS_3X3: readonly Option[] = [["top-left", "Top left"], ["top-center", "Top centre"], ["top-right", "Top right"],
  ["middle-left", "Middle left"], ["middle-center", "Middle centre"], ["middle-right", "Middle right"],
  ["bottom-left", "Bottom left"], ["bottom-center", "Bottom centre"], ["bottom-right", "Bottom right"]];
export const ICONS: readonly Option[] = [["flame", "Flame"], ["sparkles", "Sparkles"], ["badge-percent", "Percent badge"], ["rupee", "Rupee"], ["file-text", "File"],
  ["library", "Library"], ["star", "Star"], ["tag", "Tag"], ["gift", "Gift"], ["download", "Download"], ["zap", "Lightning"], ["shopping-bag", "Bag"], ["heart", "Heart"]];

// Banner slots: one for each place on the homepage (below the top area) where banner sections can show.
export const HOME_SLOT_POSITIONS = Object.entries(POSITIONS).filter(([key, p]) => p.page === "home" && !key.startsWith("home-top"))
  .map(([key, p]) => [key, p.label] as const);

// ---------------------------------------------------------------- field builders
const f = (group: string, id: string, type: FieldType, label: string, def: Value, extra: Partial<FieldDef> = {}): FieldDef => ({ id, type, label, group, default: def, ...extra });

const heading = (text: string, o: { sub?: string; subLabel?: string; align?: boolean } = {}): FieldDef[] => [
  f("Content", "heading", "text", "Heading", text, { maxLength: 120 }),
  ...(o.sub !== undefined ? [f("Content", "subheading", "text", o.subLabel ?? "Subheading", o.sub, { maxLength: 160 })] : []),
  f("Content", "heading_size", "select", "Heading size", "medium", { options: SIZES }),
  ...(o.align === false ? [] : [f("Content", "heading_align", "select", "Heading alignment", "left", { options: ALIGNS })]),
];
const COLOURS: FieldDef[] = [
  f("Colours", "text_color", "color", "Text", "", { help: "Empty keeps the theme text colour." }),
  f("Colours", "background", "color", "Background", ""),
  f("Colours", "background_2", "color", "Gradient to", "", { help: "A second colour turns the background into a diagonal gradient.", showWhen: { id: "background", not: [""] } }),
  f("Colours", "highlight", "color", "Highlight", "", { help: "Links, icons and accents in this section." }),
  f("Colours", "button_bg", "color", "Button background", ""),
  f("Colours", "button_text", "color", "Button text", ""),
];
const sectionFields = (o: { rounded?: boolean; full?: boolean } = {}): FieldDef[] => [
  f("Section", "custom_spacing", "checkbox", "Custom spacing", false, { help: "Off keeps the store's own spacing." }),
  f("Section", "pad_top", "range", "Padding top", 48, { min: 0, max: 120, step: 4, unit: "px", showWhen: { id: "custom_spacing", is: [true] } }),
  f("Section", "pad_bottom", "range", "Padding bottom", 48, { min: 0, max: 120, step: 4, unit: "px", showWhen: { id: "custom_spacing", is: [true] } }),
  f("Section", "divider", "checkbox", "Show divider", false, { help: "A thin line under the section." }),
  ...(o.full === false ? [] : [f("Section", "full_width", "checkbox", "Full width", false, { help: "Lets the section run edge to edge." })]),
  ...(o.rounded === false ? [] : [f("Section", "rounded", "checkbox", "Rounded corners", false)]),
];
const button = (label: string, url: string, group = "Content"): FieldDef[] => [
  f(group, "button_label", "text", "Button label", label, { maxLength: 40, help: "Leave empty for no button." }),
  f(group, "button_url", "url", "Button link", url, { maxLength: 500, placeholder: "/search", showWhen: { id: "button_label", not: [""] } }),
];
const common = (...parts: FieldDef[][]) => parts.flat();

const trim = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const head = (fallback: string) => (s: Settings) => (typeof s.heading === "string" && s.heading) || fallback;

// ---------------------------------------------------------------- the registry
export const SECTION_TYPES: SectionType[] = [
  {
    id: "top", label: "Top area", category: "Store sections", singleton: true, removable: false,
    description: "The hero and the column beside it. What shows here is set in Banners > Sections; this only controls its spacing and width.",
    fields: sectionFields({ rounded: false }), summary: () => "Banners in the main area and the column beside it",
  },
  {
    id: "quick-links", label: "Quick links", category: "Store sections", singleton: true, removable: true,
    description: "The row of shortcut buttons under the top area.",
    fields: common([f("Layout", "columns", "range", "Columns on desktop", 6, { min: 2, max: 6, step: 1 })], COLOURS, sectionFields({ rounded: false })),
    blocks: { label: "Links", itemLabel: "Link", max: 12, titleField: "label", fields: [
      f("Content", "label", "text", "Label", "", { maxLength: 40 }), f("Content", "href", "url", "Link", "/search", { maxLength: 300 }),
      f("Content", "icon", "select", "Icon", "library", { options: ICONS })],
    defaults: [{ label: "Bestsellers", href: "/search?sort=popular", icon: "flame" }, { label: "New arrivals", href: "/search?sort=new", icon: "sparkles" },
      { label: "Offers", href: "/search?offer=1", icon: "badge-percent" }, { label: "Under ₹199", href: "/search?price=0-199", icon: "rupee" },
      { label: "TDL files", href: "/search?format=TDL", icon: "file-text" }, { label: "All add-ons", href: "/search", icon: "library" }] },
    summary: (_s, blocks) => `${blocks.length} shortcut${blocks.length === 1 ? "" : "s"}: ${blocks.slice(0, 3).map((b) => b.settings.label).join(", ")}${blocks.length > 3 ? "…" : ""}`,
  },
  {
    id: "categories", label: "Category tiles", category: "Store sections", singleton: true, removable: true,
    description: "Tiles for the store's categories, each with its image.",
    fields: common(heading("Browse by category", { sub: "" }),
      [f("Content", "link_label", "text", "Link label", "All add-ons", { maxLength: 40, help: "The link at the end of the heading. Empty hides it." })],
      [f("Layout", "limit", "range", "Categories to show", 12, { min: 2, max: 24, step: 1 }),
        f("Layout", "tile_width", "range", "Tile width", 200, { min: 140, max: 320, step: 10, unit: "px", help: "Narrower tiles fit more on a row." })],
      COLOURS, sectionFields()),
    summary: head("Browse by category"),
  },
  {
    id: "rails", label: "Product rows", category: "Store sections", singleton: true, removable: true,
    description: "Bestsellers, new arrivals, offers and coming soon, as swipeable rows (a small store shows one grid instead).",
    fields: common(
      [f("Content", "grid_heading", "text", "Heading for a small store's grid", "Shop the collection", { maxLength: 120 }), f("Content", "heading_size", "select", "Heading size", "medium", { options: SIZES }),
        f("Content", "heading_align", "select", "Heading alignment", "left", { options: ALIGNS })],
      [f("Layout", "show_bestsellers", "checkbox", "Show Bestsellers", true), f("Layout", "show_new", "checkbox", "Show New arrivals", true),
        f("Layout", "show_offers", "checkbox", "Show On offer", true), f("Layout", "show_soon", "checkbox", "Show Coming soon", true),
        f("Layout", "limit", "range", "Products per row", 10, { min: 4, max: 12, step: 1 }),
        f("Layout", "card_width", "range", "Card width", 216, { min: 160, max: 320, step: 4, unit: "px", help: "A narrower card shows more of the row." })],
      COLOURS, sectionFields()),
    summary: (s) => ["bestsellers", "new", "offers", "soon"].filter((k) => s[`show_${k}`]).join(", ") || "No rows switched on",
  },
  {
    id: "collection-rows", label: "Pack rows", category: "Store sections", singleton: true, removable: true,
    description: "One swipeable row for each published pack (collection): its name, its one-line pitch, its first products and a link to the whole pack.",
    fields: common(heading("", { sub: "" }),
      [f("Layout", "limit", "range", "Products per row", 10, { min: 2, max: 12, step: 1 }),
        f("Layout", "card_width", "range", "Card width", 216, { min: 160, max: 320, step: 4, unit: "px", help: "A narrower card shows more of the row." })],
      COLOURS, sectionFields()),
    summary: head("One row per pack"),
  },
  {
    id: "look-inside", label: "Look inside", category: "Store sections", singleton: true, removable: true,
    description: "Highlights from your products in a dark band.",
    fields: common(heading("Look inside", { sub: "A glimpse before you buy" }),
      [f("Layout", "limit", "range", "Products to show", 8, { min: 2, max: 12, step: 1 })], COLOURS, sectionFields({ rounded: false })),
    summary: head("Look inside"),
  },
  {
    id: "faq", label: "Questions", category: "Store sections", singleton: true, removable: true,
    description: "Common questions, each opening to its answer.",
    fields: common(heading("Good to know"), [f("Layout", "columns", "select", "Columns on desktop", "2", { options: [["1", "One"], ["2", "Two"]] })], COLOURS, sectionFields()),
    blocks: { label: "Questions", itemLabel: "Question", max: 20, titleField: "question", fields: [
      f("Content", "question", "text", "Question", "", { maxLength: 200 }), f("Content", "answer", "textarea", "Answer", "", { maxLength: 1000 })],
    defaults: [
      { question: "How do I get my add-on?", answer: "Download it right after payment, from your order page or library." },
      { question: "Do I need an account?", answer: "No. Check out with your email; sign in later to see your library." },
      { question: "What do I receive?", answer: "TallyPrime TDL source code or TCP files, licensed for your own use. Each page states the version it supports." },
      { question: "Can I buy several add-ons?", answer: "Yes. Add them to your bag and pay once." },
      { question: "Can I get a refund?", answer: "If a file won't open or doesn't work with the stated TallyPrime version, we replace or refund it." }] },
    summary: (s, blocks) => `${(s.heading as string) || "Good to know"} · ${blocks.length} question${blocks.length === 1 ? "" : "s"}`,
  },
  {
    id: "banner-slot", label: "Banner slot", category: "Banners", singleton: false, removable: true,
    description: "A place on the page where banner sections show. Which banners appear, and their layout, is set in Banners > Sections.",
    fields: common([f("Layout", "position", "select", "Banner position", HOME_SLOT_POSITIONS[0]?.[0] ?? "home-before-faq", { options: HOME_SLOT_POSITIONS,
      help: "Banner sections placed at this position show here. Each position can be used once." })], sectionFields({ rounded: false })),
    summary: (s) => HOME_SLOT_POSITIONS.find(([k]) => k === s.position)?.[1] ?? "Banner slot",
  },
  {
    id: "image-overlay", label: "Image with text overlay", category: "Content", singleton: false, removable: true,
    description: "A large image with a heading, text and a button on top, like a hero.",
    fields: common(
      heading("Make it yours", { sub: "", subLabel: "Small label", align: false }),
      [f("Content", "description", "textarea", "Text", "Tell visitors what this is about.", { maxLength: 600 })],
      button("Shop now", "/search"),
      [f("Content", "button_style", "select", "Button style", "primary", { options: [["primary", "Solid"], ["light", "Light"], ["ghost", "Outline"]], showWhen: { id: "button_label", not: [""] } })],
      [f("Image", "image", "image", "Image", "", { expect: { width: 1920, height: 700 } }),
        f("Image", "mobile_image", "image", "Phone image", "", { expect: { width: 800, height: 1000 }, help: "Optional. Shown on phones instead of the main image." }),
        f("Image", "height_desktop", "select", "Height on desktop", "600px", { options: HEIGHTS }),
        f("Image", "content_width", "range", "Content width", 560, { min: 280, max: 900, step: 20, unit: "px" }),
        f("Image", "content_position", "position", "Content position", "middle-left"),
        f("Image", "text_align", "select", "Text alignment", "left", { options: ALIGNS }),
        f("Image", "overlay_color", "color", "Overlay colour", "#000000"),
        f("Image", "overlay_opacity", "range", "Overlay opacity", 35, { min: 0, max: 90, step: 5, unit: "%" })],
      [f("Mobile", "height_mobile", "select", "Height on phones", "auto", { options: MOBILE_HEIGHTS }),
        f("Mobile", "mobile_position", "position", "Content position on phones", "bottom-left")],
      [f("Colours", "text_color", "color", "Text", "#ffffff"), f("Colours", "button_bg", "color", "Button background", ""), f("Colours", "button_text", "color", "Button text", ""),
        f("Colours", "background", "color", "Background", "", { help: "Shown behind the image while it loads, and when there is none." })],
      sectionFields()),
    summary: head("Image with text overlay"),
  },
  {
    id: "image-text", label: "Image with text", category: "Content", singleton: false, removable: true,
    description: "An image beside a heading, text and a button.",
    fields: common(
      [f("Content", "eyebrow", "text", "Small label", "", { maxLength: 60 }), f("Content", "heading", "text", "Heading", "A short, clear heading", { maxLength: 120 }),
        f("Content", "heading_size", "select", "Heading size", "medium", { options: SIZES }),
        f("Content", "description", "textarea", "Text", "Say a little more here. Blank lines start a new paragraph.", { maxLength: 1500 })],
      button("Learn more", "/search"),
      [f("Layout", "image_position", "select", "Image position", "left", { options: [["left", "Image on the left"], ["right", "Image on the right"]] }),
        f("Layout", "image_width", "select", "Image width", "medium", { options: [["small", "Small (40%)"], ["medium", "Medium (50%)"], ["large", "Large (60%)"]] }),
        f("Layout", "vertical_align", "select", "Content alignment", "middle", { options: [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]] }),
        f("Layout", "text_align", "select", "Text alignment", "left", { options: ALIGNS })],
      [f("Image", "image", "image", "Image", "", { expect: { width: 1200, height: 900 } }),
        f("Image", "image_ratio", "select", "Image shape", "landscape", { options: [["adapt", "Adapt to the image"], ["landscape", "Landscape 4:3"], ["square", "Square"], ["portrait", "Portrait 4:5"], ["wide", "Wide 16:9"]] }),
        f("Image", "rounded_image", "checkbox", "Round the image corners", true)],
      [f("Mobile", "mobile_image_first", "checkbox", "Show the image first on phones", true)],
      COLOURS, sectionFields()),
    summary: head("Image with text"),
  },
  {
    id: "rich-text", label: "Rich text", category: "Content", singleton: false, removable: true,
    description: "A heading, a few paragraphs and a button, centred or aligned.",
    fields: common(
      [f("Content", "eyebrow", "text", "Small label", "", { maxLength: 60 }), f("Content", "heading", "text", "Heading", "Talk about your store", { maxLength: 120 }),
        f("Content", "heading_size", "select", "Heading size", "medium", { options: SIZES }),
        f("Content", "description", "textarea", "Text", "Share a story, an announcement or a few details. Blank lines start a new paragraph.", { maxLength: 3000 })],
      button("", "/search"),
      [f("Layout", "content_width", "range", "Content width", 720, { min: 400, max: 1200, step: 20, unit: "px" }),
        f("Layout", "text_align", "select", "Text alignment", "center", { options: ALIGNS })],
      COLOURS, sectionFields()),
    summary: head("Rich text"),
  },
];

export const typeOf = (id: string) => SECTION_TYPES.find((t) => t.id === id);

// ---------------------------------------------------------------- defaults
export const defaultsOf = (fields: FieldDef[]): Settings => Object.fromEntries(fields.map((x) => [x.id, x.default]));
export const defaultBlocks = (t: SectionType, id: () => string = newId): Block[] =>
  (t.blocks?.defaults ?? []).map((d) => ({ id: id(), settings: { ...defaultsOf(t.blocks!.fields), ...d } }));

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newId(random: () => number = Math.random, length = 6) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return out;
}

// What the homepage shows when nothing has been saved: today's order, with every setting at its default.
const DEFAULT_ORDER: [id: string, type: string, settings?: Settings][] = [
  ["top", "top"], ["quick-links", "quick-links"], ["categories", "categories"],
  ["slot-after-categories", "banner-slot", { position: "home-after-categories" }],
  ["rails", "rails"], ["packs", "collection-rows"], ["slot-after-products", "banner-slot", { position: "home-after-products" }],
  ["look-inside", "look-inside"],
  ["slot-before-faq", "banner-slot", { position: "home-before-faq" }], ["faq", "faq"],
];
export function defaultLayout(): Layout {
  return { version: 1, sections: DEFAULT_ORDER.map(([id, type, settings = {}]) => {
    const t = typeOf(type)!;
    return { id, type, enabled: true, settings, ...(t.blocks ? { blocks: defaultBlocks(t, () => newId()) } : {}) };
  }) };
}

// ---------------------------------------------------------------- validation
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RELATIVE = /^\/(?!\/)[^\s<>"'\\`]*$/;
const HTTPS = /^https:\/\/[^\s<>"'\\`]+$/;
const MEDIA = /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
export const isSafeUrl = (v: string) => v === "" || ((RELATIVE.test(v) || HTTPS.test(v)) && v.length <= 2000);
export const isSafeImage = (v: string) => v === "" || ((MEDIA.test(v) || HTTPS.test(v)) && v.length <= 2000);

// One value against its field. Strict (saving) throws a message an admin can act on; lenient (rendering) falls back to the default.
export function cleanValue(field: FieldDef, raw: unknown, strict: boolean): Value {
  const bad = (why: string): Value => { if (strict) throw new SectionError(`${field.label}: ${why}`); return field.default; };
  switch (field.type) {
    case "checkbox":
      if (typeof raw === "boolean") return raw;
      if (raw === "1" || raw === "true" || raw === "on" || raw === 1) return true;
      if (raw === "0" || raw === "false" || raw === "off" || raw === 0 || raw === "" || raw == null) return false;
      return bad("must be on or off.");
    case "range": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n) || !Number.isInteger(n)) return bad("must be a whole number.");
      if (n < (field.min ?? 0) || n > (field.max ?? 100)) return bad(`must be between ${field.min} and ${field.max}.`);
      return n;
    }
    case "select": case "position": {
      const options = field.type === "position" ? POSITIONS_3X3 : field.options ?? [];
      return typeof raw === "string" && options.some(([v]) => v === raw) ? raw : bad("is not one of the choices.");
    }
    case "color":
      if (raw == null || raw === "") return "";
      return isHex(raw) ? raw.toLowerCase() : bad("must be a colour like #1a2b3c.");
    case "url": case "image": {
      const v = raw == null ? "" : typeof raw === "string" ? raw.trim() : null;
      if (v === null) return bad("must be text.");
      const ok = field.type === "url" ? isSafeUrl(v) : isSafeImage(v);
      return ok ? v : bad(field.type === "url" ? "must be a link starting with / or https://." : "must be an uploaded image or an https:// address.");
    }
    default: {
      if (raw == null) return field.type === "text" || field.type === "textarea" ? "" : field.default;
      if (typeof raw !== "string") return bad("must be text.");
      const v = (field.type === "text" ? raw.replace(/[\r\n]+/g, " ") : raw.replace(/\r\n?/g, "\n")).replace(CONTROL, "").trim();
      const max = field.maxLength ?? (field.type === "textarea" ? 2000 : 200);
      if (v.length > max) return bad(`is too long (${v.length} of ${max} characters).`);
      return v;
    }
  }
}

// Whitelist by schema: unknown keys are dropped, and a field that is absent stays absent (the default applies at render time).
export function cleanSettings(fields: FieldDef[], raw: unknown, strict: boolean): Settings {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const out: Settings = {};
  for (const field of fields) if (Object.hasOwn(input, field.id)) out[field.id] = cleanValue(field, input[field.id], strict);
  return out;
}

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const BLOCK_ID = /^[a-z0-9]{1,12}$/;

export function cleanBlocks(t: SectionType, raw: unknown, strict: boolean): Block[] | undefined {
  if (!t.blocks) return undefined;
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) { if (strict) throw new SectionError(`${t.blocks.label} must be a list.`); return undefined; }
  if (raw.length > t.blocks.max) { if (strict) throw new SectionError(`${t.blocks.label}: at most ${t.blocks.max} allowed.`); }
  const seen = new Set<string>();
  const out: Block[] = [];
  for (const item of raw.slice(0, t.blocks.max)) {
    const obj = item && typeof item === "object" ? item as { id?: unknown; settings?: unknown } : {};
    let id = typeof obj.id === "string" && BLOCK_ID.test(obj.id) && !seen.has(obj.id) ? obj.id : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    out.push({ id, settings: cleanSettings(t.blocks.fields, obj.settings, strict) });
  }
  return out;
}

export function cleanSection(raw: unknown, strict: boolean): StoredSection | null {
  const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  const t = o && typeof o.type === "string" ? typeOf(o.type) : undefined;
  if (!o || !t) { if (strict) throw new SectionError("Unknown section type."); return null; }
  let id = typeof o.id === "string" && ID.test(o.id) ? o.id : "";
  if (!id) { if (strict) throw new SectionError("A section is missing its id."); id = newId(); }
  const blocks = cleanBlocks(t, o.blocks, strict);
  return { id, type: t.id, enabled: o.enabled !== false, settings: cleanSettings(t.fields, o.settings, strict), ...(blocks ? { blocks } : {}) };
}

// A whole layout. Strict: any problem is an error (max 40 sections, unique ids, one of each single-use type, one banner slot per position).
// Lenient: bad entries are dropped, so a damaged saved layout still renders what it can.
export function cleanLayout(raw: unknown, strict: boolean): Layout {
  const o = raw && typeof raw === "object" ? raw as { sections?: unknown } : null;
  if (!o || !Array.isArray(o.sections)) { if (strict) throw new SectionError("The layout is not valid."); return { version: 1, sections: [] }; }
  if (strict && o.sections.length > MAX_SECTIONS) throw new SectionError(`A page can have at most ${MAX_SECTIONS} sections.`);
  const ids = new Set<string>(), singles = new Set<string>(), slots = new Set<string>();
  const sections: StoredSection[] = [];
  for (const item of o.sections.slice(0, MAX_SECTIONS)) {
    const s = cleanSection(item, strict);
    if (!s) continue;
    const t = typeOf(s.type)!;
    const problem = ids.has(s.id) ? `Two sections share the id "${s.id}".` : t.singleton && singles.has(t.id) ? `"${t.label}" can only be on the page once.` : "";
    if (problem) { if (strict) throw new SectionError(problem); continue; }
    ids.add(s.id); if (t.singleton) singles.add(t.id);
    if (s.type === "banner-slot") {
      const position = (s.settings.position as string) ?? HOME_SLOT_POSITIONS[0][0];
      if (slots.has(position)) { if (strict) throw new SectionError("Two banner slots use the same position."); continue; }
      slots.add(position);
    }
    sections.push(s);
  }
  return { version: 1, sections };
}

// ---------------------------------------------------------------- resolution (render time)
export function resolveSection(s: StoredSection): ResolvedSection {
  const t = typeOf(s.type)!;
  const settings = { ...defaultsOf(t.fields), ...s.settings };
  const blocks = (s.blocks ?? (t.blocks ? defaultBlocks(t, () => newId()) : [])).map((b) => ({ id: b.id, settings: { ...defaultsOf(t.blocks!.fields), ...b.settings } }));
  return { id: s.id, type: s.type, enabled: s.enabled, settings, blocks };
}
// A saved layout predates a new section type: the packs row is added after the product rows so it still shows.
const PACKS: StoredSection = { id: "packs", type: "collection-rows", enabled: true, settings: {} };
export function resolveLayout(stored: unknown): ResolvedSection[] {
  const layout = stored ? cleanLayout(stored, false) : null;
  const sections = [...(layout && layout.sections.length ? layout : defaultLayout()).sections];
  if (!sections.some((s) => s.type === "collection-rows")) {
    const at = sections.findIndex((s) => s.type === "rails");
    sections.splice(at >= 0 ? at + 1 : sections.length, 0, { ...PACKS });
  }
  return sections.map(resolveSection);
}

// ---------------------------------------------------------------- show / hide of dependent fields
export function visible(field: FieldDef, values: Settings): boolean {
  const w = field.showWhen;
  if (!w) return true;
  const v = values[w.id];
  if (w.is) return w.is.includes(v);
  if (w.not) return !w.not.includes(v);
  return true;
}

// ---------------------------------------------------------------- how a section's common settings look on the page
// A wrapper around each section carries the colours, spacing and shape. Only settings that differ from the store's own
// look produce anything, so a default section is drawn exactly as before.
export type Frame = { className: string; style: Record<string, string> };
const SCALE: Record<string, string> = { small: ".8", large: "1.25" };
export function sectionFrame(s: Settings): Frame {
  const classes = ["hs"];
  const style: Record<string, string> = {};
  const colour = (k: string) => (typeof s[k] === "string" && isHex(s[k]) ? s[k] as string : "");
  if (colour("text_color")) { classes.push("hs-text"); style["--hs-text"] = colour("text_color"); }
  if (colour("background")) {
    classes.push("hs-bg");
    style.background = colour("background_2") ? `linear-gradient(135deg, ${colour("background")}, ${colour("background_2")})` : colour("background");
  }
  if (colour("highlight")) { classes.push("hs-hl"); style["--hs-hl"] = colour("highlight"); }
  if (colour("button_bg")) { classes.push("hs-btn-bg"); style["--hs-btn-bg"] = colour("button_bg"); }
  if (colour("button_text")) { classes.push("hs-btn-fg"); style["--hs-btn-fg"] = colour("button_text"); }
  if (s.custom_spacing === true) {
    classes.push("hs-pad");
    style["--hs-pt"] = `${Number(s.pad_top ?? 48)}px`; style["--hs-pb"] = `${Number(s.pad_bottom ?? 48)}px`;
  }
  if (s.divider === true) classes.push("hs-divider");
  if (s.full_width === true) classes.push("hs-full");
  if (s.rounded === true) classes.push("hs-round");
  if (typeof s.heading_size === "string" && SCALE[s.heading_size]) { classes.push("hs-hs"); style["--hs-hscale"] = SCALE[s.heading_size]; }
  if (s.heading_align === "center" || s.heading_align === "right") classes.push(`hs-ha-${s.heading_align}`);
  return { className: classes.join(" "), style };
}
