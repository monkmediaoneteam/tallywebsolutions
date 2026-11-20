import Link from "next/link";
import { BadgePercent, Download, FileText, Flame, Gift, Heart, IndianRupee, Library, ShoppingBag, Sparkles, Star, Tag, Zap, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

const ICON: Record<string, LucideIcon> = { flame: Flame, sparkles: Sparkles, "badge-percent": BadgePercent, rupee: IndianRupee, "file-text": FileText, library: Library,
  star: Star, tag: Tag, gift: Gift, download: Download, zap: Zap, "shopping-bag": ShoppingBag, heart: Heart };
export type QuickLink = { label: string; href: string; icon: string };

export default function ShopStrip({ links, columns }: { links: QuickLink[]; columns?: number }) {
  if (!links.length) return null;
  return <nav className="wrap shop-strip" aria-label="Shop by" style={columns && columns !== 6 ? { "--cols": columns } as CSSProperties : undefined}>
    {links.map(({ label, href, icon }, i) => { const Icon = ICON[icon] ?? Library;
      return <Link key={i} href={href || "/search"} className="shop-link"><span className="shop-icon"><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span>{label}</Link>; })}
  </nav>;
}
