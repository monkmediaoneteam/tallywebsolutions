// Edits to a homepage layout, as pure functions (the admin route applies them, then validates the whole result).
import { HOME_SLOT_POSITIONS, MAX_SECTIONS, SectionError, cleanBlocks, cleanLayout, cleanSettings, defaultBlocks, newId, typeOf, type Layout, type StoredSection } from "./home-sections";

const find = (layout: Layout, id: string) => {
  const i = layout.sections.findIndex((s) => s.id === id);
  if (i < 0) throw new SectionError("That section no longer exists. Reload the page.");
  return i;
};
const uniqueId = (layout: Layout, base: string) => {
  const taken = new Set(layout.sections.map((s) => s.id));
  let id = base;
  while (taken.has(id)) id = `${base.slice(0, 30)}-${newId()}`;
  return id;
};

export function addSection(layout: Layout, type: string, position?: string): { layout: Layout; id: string } {
  const t = typeOf(type);
  if (!t) throw new SectionError("Unknown section type.");
  if (layout.sections.length >= MAX_SECTIONS) throw new SectionError(`A page can have at most ${MAX_SECTIONS} sections.`);
  if (t.singleton && layout.sections.some((s) => s.type === type)) throw new SectionError(`"${t.label}" is already on the page.`);
  const settings: StoredSection["settings"] = {};
  if (type === "banner-slot") {
    const used = new Set(layout.sections.filter((s) => s.type === "banner-slot").map((s) => s.settings.position));
    const free = HOME_SLOT_POSITIONS.map(([k]) => k as string).filter((k) => !used.has(k));
    const chosen = position && free.includes(position) ? position : free[0];
    if (!chosen) throw new SectionError("Every banner position already has a slot.");
    settings.position = chosen;
  }
  const id = uniqueId(layout, t.singleton ? t.id : `${t.id}-${newId()}`);
  const section: StoredSection = { id, type, enabled: true, settings, ...(t.blocks ? { blocks: defaultBlocks(t) } : {}) };
  return { layout: { ...layout, sections: [...layout.sections, section] }, id };
}

export function moveSection(layout: Layout, id: string, direction: string): Layout {
  const i = find(layout, id), j = direction === "up" ? i - 1 : direction === "down" ? i + 1 : NaN;
  if (!Number.isInteger(j)) throw new SectionError("Unknown direction.");
  if (j < 0 || j >= layout.sections.length) return layout;
  const sections = [...layout.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return { ...layout, sections };
}

export function toggleSection(layout: Layout, id: string, enabled?: boolean): Layout {
  const i = find(layout, id);
  const sections = [...layout.sections];
  sections[i] = { ...sections[i], enabled: enabled ?? !sections[i].enabled };
  return { ...layout, sections };
}

export function duplicateSection(layout: Layout, id: string): { layout: Layout; id: string } {
  const i = find(layout, id), source = layout.sections[i], t = typeOf(source.type)!;
  if (t.singleton) throw new SectionError(`"${t.label}" can only be on the page once.`);
  if (layout.sections.length >= MAX_SECTIONS) throw new SectionError(`A page can have at most ${MAX_SECTIONS} sections.`);
  let settings = { ...source.settings };
  if (source.type === "banner-slot") {
    const used = new Set(layout.sections.filter((s) => s.type === "banner-slot").map((s) => s.settings.position));
    const free = HOME_SLOT_POSITIONS.map(([k]) => k as string).filter((k) => !used.has(k));
    if (!free.length) throw new SectionError("Every banner position already has a slot.");
    settings = { ...settings, position: free[0] };
  }
  const copy: StoredSection = { ...source, id: uniqueId(layout, `${t.id}-${newId()}`), settings, ...(source.blocks ? { blocks: source.blocks.map((b) => ({ ...b, id: newId() })) } : {}) };
  const sections = [...layout.sections];
  sections.splice(i + 1, 0, copy);
  return { layout: { ...layout, sections }, id: copy.id };
}

export function removeSection(layout: Layout, id: string): Layout {
  const i = find(layout, id), t = typeOf(layout.sections[i].type)!;
  if (!t.removable) throw new SectionError(`"${t.label}" cannot be deleted. Switch it off instead.`);
  return { ...layout, sections: layout.sections.filter((_, k) => k !== i) };
}

// New settings and blocks for one section, checked strictly against its schema.
export function saveSection(layout: Layout, id: string, input: { settings?: unknown; blocks?: unknown; enabled?: unknown }): Layout {
  const i = find(layout, id), current = layout.sections[i], t = typeOf(current.type)!;
  const blocks = cleanBlocks(t, input.blocks ?? [], true);
  const next: StoredSection = { ...current, settings: cleanSettings(t.fields, input.settings, true), ...(blocks ? { blocks } : {}), ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}) };
  const sections = [...layout.sections];
  sections[i] = next;
  return cleanLayout({ ...layout, sections }, true);
}
