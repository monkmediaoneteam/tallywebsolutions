// Shared banner helpers: safe to import from server and client code.
export type BannerData = { id: string; title: string; body: string | null; image_url: string | null; mobile_image_url: string | null;
  link_url: string | null; link_label: string | null; payload: Record<string, unknown>; sort: number; status: string;
  publish_at: string | null; ends_at: string | null; updated_at: string };

export const PLACEMENTS = { hero: "Hero (rotating, top of the homepage)", "side-1": "Side card 1 (top right)", "side-2": "Side card 2 (bottom right)" } as const;
export const placementOf = (b?: { payload: Record<string, unknown> }) => (typeof b?.payload?.placement === "string" && b.payload.placement in PLACEMENTS ? b.payload.placement : "hero") as keyof typeof PLACEMENTS;

// Payload settings the banner form does not edit; sent back unchanged so saving keeps them.
export const KEPT_PAYLOAD = ["attribution", "collection_slug", "author_id", "video_url", "size", "category_slug"];

// Stored instants are shown and entered in India time.
export function toIndiaInput(value: string | null) {
  if (!value) return "";
  const t = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
  if (!Number.isFinite(t)) return "";
  return new Date(t + 330 * 60000).toISOString().slice(0, 16);
}
