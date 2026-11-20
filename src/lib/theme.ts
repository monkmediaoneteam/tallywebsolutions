// Theme settings: a few global choices (colours, width, corners, buttons) turned into CSS custom properties.
// Client-safe. Only validated values reach the CSS: colours are #rgb/#rrggbb, everything else is a fixed choice.
export type ThemeField = { id: string; label: string; type: "color" | "select"; default: string; options?: readonly (readonly [string, string])[]; help?: string; group: string };

export const THEME_FIELDS: ThemeField[] = [
  { id: "brand", label: "Brand colour", type: "color", default: "#2e2e7e", group: "Colours", help: "Buttons, links and active states." },
  { id: "brand_deep", label: "Brand, darker", type: "color", default: "#1f1f5e", group: "Colours", help: "Hover and pressed states." },
  { id: "accent", label: "Accent", type: "color", default: "#299637", group: "Colours", help: "Offers, ticks and small highlights." },
  { id: "ink", label: "Text", type: "color", default: "#15151f", group: "Colours" },
  { id: "bg", label: "Page background", type: "color", default: "#ffffff", group: "Colours" },
  { id: "link", label: "Link colour", type: "color", default: "#2e2e7e", group: "Colours", help: "Text links such as View all." },
  { id: "max_width", label: "Page width", type: "select", default: "1760", group: "Layout", options: [["1200", "1200 px: narrow"], ["1280", "1280 px"], ["1440", "1440 px"], ["1600", "1600 px"], ["1760", "1760 px: wide (default)"]] },
  { id: "radius", label: "Corner radius", type: "select", default: "default", group: "Shape", options: [["sharp", "Sharp"], ["default", "Default"], ["soft", "Soft"], ["round", "Very round"]] },
  { id: "button", label: "Button style", type: "select", default: "pill", group: "Shape", options: [["square", "Square"], ["rounded", "Rounded"], ["pill", "Pill (default)"]] },
  { id: "tracking", label: "Heading letter-spacing", type: "select", default: "tight", group: "Shape", options: [["tight", "Tight (default)"], ["normal", "Normal"], ["wide", "Open"]] },
];
export type Theme = Record<string, string>;
export class ThemeError extends Error {}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const expand = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toLowerCase();

// Only fields that differ from the default are kept. Strict throws on a bad value; lenient drops it.
export function cleanTheme(raw: unknown, strict: boolean): Theme {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const out: Theme = {};
  for (const f of THEME_FIELDS) {
    if (!Object.hasOwn(input, f.id)) continue;
    const v = input[f.id];
    const ok = typeof v === "string" && (f.type === "color" ? HEX.test(v) : f.options!.some(([o]) => o === v));
    if (!ok) { if (strict) throw new ThemeError(`${f.label}: ${f.type === "color" ? "must be a colour like #1a2b3c" : "is not one of the choices"}.`); continue; }
    const value = f.type === "color" ? expand(v as string) : v as string;
    if (value !== f.default) out[f.id] = value;
  }
  return out;
}
export const themeValues = (saved: unknown): Theme => ({ ...Object.fromEntries(THEME_FIELDS.map((f) => [f.id, f.default])), ...cleanTheme(saved, false) });

const RADIUS: Record<string, number> = { sharp: 0.3, default: 1, soft: 1.6, round: 2.2 };
const BUTTON: Record<string, string> = { square: "2px", rounded: "12px", pill: "999px" };
const TRACKING: Record<string, string> = { tight: "-0.035em", normal: "-0.015em", wide: "0.005em" };

// The CSS to inject. Nothing at all for an untouched theme.
export function themeCss(saved: unknown): string {
  const t = cleanTheme(saved, false);
  const d: string[] = [];
  const both = (name: string, v: string) => d.push(`--${name}:${v}`, `--color-${name}:${v}`);
  if (t.brand) { both("brand", t.brand); d.push("--link:var(--brand)"); }
  if (t.brand_deep) both("brand-deep", t.brand_deep);
  if (t.accent) both("gold", t.accent);
  if (t.ink) { both("ink", t.ink); d.push("--ink-soft:color-mix(in srgb,var(--ink) 82%,var(--bg))", "--color-ink-soft:var(--ink-soft)", "--ink-mute:color-mix(in srgb,var(--ink) 86%,var(--bg))", "--color-ink-mute:var(--ink-mute)"); }
  if (t.bg) both("bg", t.bg);
  if (t.link) d.push(`--link:${t.link}`);
  if (t.max_width) d.push(`--container:${Number(t.max_width)}px`);
  if (t.radius) for (const [i, base] of [[1, 4], [2, 10], [3, 18]] as const) d.push(`--radius-${i}:${Math.round(base * RADIUS[t.radius] * 10) / 10}px`);
  if (t.button) d.push(`--btn-radius:${BUTTON[t.button]}`);
  if (t.tracking) d.push(`--heading-tracking:${TRACKING[t.tracking]}`);
  let css = d.length ? `:root{${d.join(";")}}` : "";
  if (t.button) css += ".btn{border-radius:var(--btn-radius)}.card-foot .btn,.card-add{border-radius:min(var(--btn-radius),12px)}";
  if (t.brand || t.brand_deep) css += ".btn-primary,.btn-neel{background:linear-gradient(175deg,color-mix(in srgb,var(--brand) 82%,#fff) 0%,var(--brand) 55%,var(--brand-deep) 100%)}.btn-primary:hover:not(:disabled),.btn-neel:hover:not(:disabled){background:linear-gradient(175deg,var(--brand) 0%,var(--brand-deep) 100%)}";
  return css;
}

// WCAG contrast ratio of two hex colours.
export function luminance(hex: string): number {
  const h = expand(hex);
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export function themeWarnings(values: Theme): string[] {
  const out: string[] = [];
  const check = (a: string, b: string, what: string, min = 4.5) => { const r = contrast(a, b); if (r < min) out.push(`${what}: contrast is ${r.toFixed(1)}:1; aim for at least ${min}:1.`); };
  check(values.ink, values.bg, "Text on the page background");
  check(values.link, values.bg, "Links on the page background");
  check("#ffffff", values.brand, "White button text on the brand colour");
  return out;
}
