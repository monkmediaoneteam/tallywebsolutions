import { getPublicContent } from "@/lib/content";
import { flag } from "@/lib/env";
import { bestsellerSlugs, getCategories, getPublishedAuthors, getStoreBooks } from "@/lib/store-data";
import { buildHome, sectionsAt } from "@/lib/home";
import type { Position } from "@/lib/banner-sections";
import { getSiteSettings } from "@/lib/site-settings";
import { resolveLayout, sectionFrame, type ResolvedSection } from "@/lib/home-sections";
import { siteUrl } from "@/lib/store";
import { seoMetadata, SeoHead } from "@/lib/seo-meta";
import HeroCampaign from "@/components/home/HeroCampaign";
import CategoryTiles from "@/components/home/CategoryTiles";
import Featured from "@/components/home/Featured";
import LookInside from "@/components/home/LookInside";
import FaqGrid from "@/components/home/FaqGrid";
import HomeSide from "@/components/home/HomeSide";
import ShopStrip from "@/components/home/ShopStrip";
import { ImageOverlay, ImageText, RichText } from "@/components/home/ContentSections";
import { SectionList } from "@/components/home/BannerSectionView";
import CollectionRows from "@/components/home/CollectionRows";

export const dynamic = "force-dynamic";
export async function generateMetadata() { return seoMetadata("/"); }

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);

export default async function Home() {
  const now = new Date();
  const [books, categories, content, bestsellers, authors, saved] = await Promise.all([getStoreBooks(now), getCategories(), getPublicContent(), bestsellerSlugs(), getPublishedAuthors(), getSiteSettings()]);
  const home = buildHome({ books, categories, modules: content.modules, bestsellers, authors, now });
  const layout = resolveLayout(saved.home_layout);
  const enabled = flag("COMMERCE_ENABLED");
  const covers = [...(home.rails.find((r) => r.key === "bestsellers")?.books ?? []), ...books]
    .filter((b, i, all) => b.cover && all.findIndex((x) => x.slug === b.slug) === i).slice(0, 3)
    .map(({ slug, title, cover }) => ({ slug, title, cover }));
  const at = (position: Position) => sectionsAt(home.sections, position);
  const usedSlots = new Set<string>();

  // Each entry of the saved layout (or the default one, which is today's page) is drawn by its type's component.
  function draw({ type, settings: o, blocks }: ResolvedSection) {
    switch (type) {
      case "top": {
        const main = at("home-top-main"), side = at("home-top-side");
        // Banner sections are set in Admin > Banners > Sections. Empty top sections fall back to the store's own hero and product cards.
        return (main.length > 0 || side.length > 0) && <div className={`wrap home-top${side.length ? "" : " home-top-full"}`}>
          <div className="home-main"><SectionList list={main} eager fallback={<HeroCampaign banners={[]} covers={covers} />} /></div>
          {side.length > 0 && <div className="home-side"><SectionList list={side} fallback={<HomeSide books={books} />} /></div>}
        </div>;
      }
      case "quick-links":
        return <ShopStrip links={blocks.map((b) => ({ label: str(b.settings.label), href: str(b.settings.href), icon: str(b.settings.icon) })).filter((l) => l.label)} columns={num(o.columns, 6)} />;
      case "categories":
        return <CategoryTiles tiles={home.categoryTiles.slice(0, num(o.limit, 12)).map(({ slug, name, count, image, covers: c }) => ({ slug, name, count, image, covers: c }))}
          heading={str(o.heading)} subheading={str(o.subheading)} linkLabel={str(o.link_label)} tileWidth={num(o.tile_width, 200)} />;
      case "rails": {
        const rails = home.rails.filter((r) => o[`show_${r.key}`] !== false).map((r) => ({ ...r, books: r.books.slice(0, num(o.limit, 12)) }));
        return <Featured books={books} rails={rails} enabled={enabled} gridHeading={str(o.grid_heading)} cardWidth={num(o.card_width, 216)} />;
      }
      case "banner-slot": {
        const position = str(o.position) as Position;
        if (usedSlots.has(position)) return null;
        usedSlots.add(position);
        return <SectionList list={at(position)} wrap="wrap section" />;
      }
      case "collection-rows": return <CollectionRows collections={content.collections} books={books} enabled={enabled} heading={str(o.heading)} subheading={str(o.subheading)} limit={num(o.limit, 10)} cardWidth={num(o.card_width, 216)} />;
      case "look-inside": return <LookInside books={books} heading={str(o.heading)} subheading={str(o.subheading)} limit={num(o.limit, 8)} />;
      case "faq":
        return <FaqGrid items={blocks.map((b) => ({ question: str(b.settings.question), answer: str(b.settings.answer) })).filter((x) => x.question)} heading={str(o.heading)} columns={Number(o.columns) || 2} />;
      case "image-overlay": return <ImageOverlay settings={o} />;
      case "image-text": return <ImageText settings={o} />;
      case "rich-text": return <RichText settings={o} />;
      default: return null;
    }
  }

  return <>
    <SeoHead path="/" site />
    {layout.filter((s) => s.enabled).map((section) => {
    const frame = sectionFrame(section.settings);
    return <div key={section.id} className={frame.className} style={frame.style} data-section={section.type}>{draw(section)}</div>;
  })}
  </>;
}
