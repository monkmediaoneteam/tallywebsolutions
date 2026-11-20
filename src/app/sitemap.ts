import type { MetadataRoute } from "next";

import { siteUrl } from '@/lib/store';
import { getBooks } from '@/lib/db';
import { visibleBook } from '@/components/book-data';
import { getCategories } from '@/lib/store-data';
import { getSeoRows, indexRows } from '@/lib/seo-store';
import { staticDefaults, productDefaults, categoryDefaults } from '@/lib/seo-pages';
import { resolveSeo, sitemapRow } from '@/lib/seo';
import { storeInfo } from '@/lib/seo-meta';
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const books = (await getBooks()).filter(visibleBook);
  const authors = new Set(books.flatMap(book => book.author_slug ? [book.author_slug] : []));
  const categories = await getCategories();
  const { site, overrides } = indexRows(await getSeoRows());
  const store = storeInfo();
  // Pages managed in Admin > SEO may be left out, or given their own priority and change frequency; noindex pages are never listed.
  const pages: { path: string; defaults?: Parameters<typeof resolveSeo>[0]['defaults']; priority: number }[] = [
    { path: '/', defaults: staticDefaults('/'), priority: 1 },
    ...['/search', '/publish', '/privacy', '/terms', '/refund-policy', '/delivery-policy'].map(path => ({ path, defaults: staticDefaults(path), priority: 0.4 })),
    ...books.map(book => ({ path: `/products/${book.slug}`, defaults: productDefaults(book), priority: 0.4 })),
    ...[...authors].map(id => ({ path: `/authors/${id}`, priority: 0.4 })),
    ...categories.map(c => ({ path: `/category/${c.slug}`, defaults: categoryDefaults(c), priority: 0.4 })),
  ];
  const rows = pages.map(({ path, defaults, priority }) => {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const r = resolveSeo({ path: encoded, defaults: defaults ?? { title: '' }, site, override: overrides.get(path), store });
    return sitemapRow(encoded, r, store, priority);
  });
  return rows.filter((row): row is NonNullable<typeof row> => row !== null);
}
