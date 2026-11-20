import { getPublicContent } from "@/lib/content";
import { flag } from "@/lib/env";
import { bestsellerSlugs, getCategories, getPublishedAuthors, getStoreBooks } from "@/lib/store-data";
import { buildHome, sectionsAt } from "@/lib/home";
import type { Position } from "@/lib/banner-sections";
import { seoMetadata, SeoHead } from "@/lib/seo-meta";
import HeroCampaign from "@/components/home/HeroCampaign";
import CategoryTiles from "@/components/home/CategoryTiles";
import Featured from "@/components/home/Featured";
import LookInside from "@/components/home/LookInside";
import LanguageStrip from "@/components/home/LanguageStrip";
import AuthorChips from "@/components/home/AuthorChips";
import PublishBand from "@/components/home/PublishBand";
import FaqGrid from "@/components/home/FaqGrid";
import HomeSide from "@/components/home/HomeSide";
import ShopStrip from "@/components/home/ShopStrip";
import { SectionList } from "@/components/home/BannerSectionView";

export const dynamic = "force-dynamic";
export async function generateMetadata() { return seoMetadata("/"); }

export default async function Home() {
  const now = new Date();
  const [books, categories, content, bestsellers, authors] = await Promise.all([getStoreBooks(now), getCategories(), getPublicContent(), bestsellerSlugs(), getPublishedAuthors()]);
  const home = buildHome({ books, categories, modules: content.modules, bestsellers, authors, now });
  const enabled = flag("COMMERCE_ENABLED");
  const covers = [...(home.rails.find((r) => r.key === "bestsellers")?.books ?? []), ...books]
    .filter((b, i, all) => b.cover && all.findIndex((x) => x.slug === b.slug) === i).slice(0, 3)
    .map(({ slug, title, cover }) => ({ slug, title, cover }));
  const at = (position: Position) => sectionsAt(home.sections, position);
  const main = at("home-top-main"), side = at("home-top-side");
  // Banner sections are set in Admin > Banners > Sections. Empty top sections fall back to the store's own hero and product cards.
  return <>
    <SeoHead path="/" site />
    {(main.length > 0 || side.length > 0) && <div className={`wrap home-top${side.length ? "" : " home-top-full"}`}>
      <div className="home-main"><SectionList list={main} eager fallback={<HeroCampaign banners={[]} covers={covers} />} /></div>
      {side.length > 0 && <div className="home-side"><SectionList list={side} fallback={<HomeSide books={books} />} /></div>}
    </div>}
    <ShopStrip />
    <CategoryTiles tiles={home.categoryTiles.map(({ slug, name, count, image, covers: c }) => ({ slug, name, count, image, covers: c }))} />
    <SectionList list={at("home-after-categories")} wrap="wrap section" />
    <Featured books={books} rails={home.rails} enabled={enabled} />
    <SectionList list={at("home-after-products")} wrap="wrap section" />
    <LookInside books={books} />
    <LanguageStrip languages={home.languages} />
    <AuthorChips authors={home.authors} />
    <PublishBand covers={covers} />
    <SectionList list={at("home-before-faq")} wrap="wrap section" />
    <FaqGrid />
  </>;
}
