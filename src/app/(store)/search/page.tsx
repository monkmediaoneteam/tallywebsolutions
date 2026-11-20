import { seoMetadata, SeoHead } from "@/lib/seo-meta";
import { getCategories, getStoreBooks, bestsellerSlugs } from "@/lib/store-data";
import { flag } from "@/lib/env";
import { parseListing } from "@/lib/listing";
import Listing from "@/components/Listing";
import { getPublicContent } from "@/lib/content";
import { bannerSections, sectionsAt } from "@/lib/home";
import { SectionList } from "@/components/home/BannerSectionView";


export const dynamic = "force-dynamic";
type Query = Record<string, string | string[] | undefined>;
export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }) {
  const p = parseListing(await searchParams);
  // A search for something specific is never indexed and keeps its own title; the plain listing is managed in Admin > SEO.
  return p.q ? { title: `Search: ${p.q}`, robots: { index: false } } : seoMetadata("/search");
}

export default async function Search({ searchParams }: { searchParams: Promise<Query> }) {
  const [query, books, categories, popularity, content] = await Promise.all([searchParams, getStoreBooks(), getCategories(), bestsellerSlugs(90, 200), getPublicContent()]);
  const params = parseListing(query);
  return <><SeoHead path="/search" /><Listing base="/search" title={params.q ? `Results for "${params.q}"` : params.offer ? "Offers" : "All add-ons"} books={books} params={params}
    categories={categories} popularity={popularity} enabled={flag("COMMERCE_ENABLED")}
    promo={<SectionList list={sectionsAt(bannerSections(content.modules), "listing-above-results")} wrap="wrap listing-promo" />} /></>;
}
