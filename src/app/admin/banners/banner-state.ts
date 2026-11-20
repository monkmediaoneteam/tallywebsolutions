import type { AdminBanner } from "./BannerForm";

const at = (v: string | null) => (v ? Date.parse(v.replace(" ", "T")) : NaN);

export type BannerTone = "live" | "wait" | "off";

// What the site does with a banner right now.
export function bannerState(b: AdminBanner, now = Date.now()): { label: string; live: boolean; tone: BannerTone } {
  if (b.status !== "published") return { label: b.status === "draft" ? "Draft" : "Archived", live: false, tone: "off" };
  if (!b.image_url) return { label: "No image", live: false, tone: "off" };
  if (b.publish_at && at(b.publish_at) > now) return { label: "Scheduled", live: false, tone: "wait" };
  if (b.ends_at && at(b.ends_at) <= now) return { label: "Ended", live: false, tone: "off" };
  return { label: "Live", live: true, tone: "live" };
}

export const TONE: Record<BannerTone, string> = { live: "bg-brand/10 text-brand", wait: "bg-gold/10 text-gold", off: "bg-bg-3 text-ink-soft" };
