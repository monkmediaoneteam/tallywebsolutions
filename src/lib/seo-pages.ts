/**
 * The pages the SEO manager lists, with the defaults each page really outputs today. Static pages are
 * listed here (the storefront reads the same defaults); categories and products come from the database.
 */
import { sql, getBooks } from "./db";
import { visibleBook } from "@/components/book-data";
import { STORE } from "./store";
import { GROUPS, type Group, type PageDefaults } from "./seo";
export { GROUPS };
export type { Group };

export type PageEntry = { path: string; label: string; group: Group; defaults: PageDefaults };

const NOINDEX = "noindex, nofollow";
export const STATIC_PAGES: PageEntry[] = [
  { path: "/", label: "Home", group: "Core pages", defaults: { title: STORE.name, fullTitle: true } },
  { path: "/search", label: "All add-ons", group: "Core pages", defaults: { title: "All add-ons" } },
  { path: "/terms", label: "Terms of Use", group: "Policies", defaults: { title: "Terms of Use" } },
  { path: "/privacy", label: "Privacy Policy", group: "Policies", defaults: { title: "Privacy Policy" } },
  { path: "/refund-policy", label: "Refund Policy", group: "Policies", defaults: { title: "Refund Policy" } },
  { path: "/delivery-policy", label: "Delivery Policy", group: "Policies", defaults: { title: "Delivery Policy" } },
  { path: "/login", label: "Sign in", group: "Account & checkout", defaults: { title: "Sign in", robots: NOINDEX } },
  { path: "/signup", label: "Create account", group: "Account & checkout", defaults: { title: "Create account", robots: NOINDEX } },
  { path: "/wishlist", label: "Your wishlist", group: "Account & checkout", defaults: { title: "Your wishlist", robots: NOINDEX } },
  { path: "/cart", label: "Your bag", group: "Account & checkout", defaults: { title: "Your bag", robots: NOINDEX } },
  { path: "/checkout", label: "Checkout", group: "Account & checkout", defaults: { title: "Checkout", robots: NOINDEX } },
  { path: "/library", label: "Your library", group: "Account & checkout", defaults: { title: "Your library", robots: NOINDEX } },
];
export const staticDefaults = (path: string): PageDefaults => {
  const page = STATIC_PAGES.find((p) => p.path === path);
  if (!page) throw new Error(`No SEO defaults for ${path}`);
  return page.defaults;
};

const MAX_LABEL = 90;
const usableImage = (url?: string | null) => url && !url.startsWith("data:") ? url : undefined;

export const categoryPath = (slug: string) => `/category/${slug}`;
export const productPath = (slug: string) => `/products/${slug}`;
export const categoryDefaults = (category: { name: string }): PageDefaults =>
  ({ title: `${category.name} add-ons`, description: `TallyPrime add-ons for ${category.name.toLowerCase()}.` });
export const productDefaults = (book: { title: string; description: string | null; cover: string | null }): PageDefaults =>
  ({ title: book.title, description: book.description || undefined, ogImage: usableImage(book.cover), ogType: "product", hasJsonLd: true });

/** Static pages, every published category and every visible product. */
export async function listEntries(): Promise<PageEntry[]> {
  const [categories, books] = await Promise.all([
    sql`select slug, name from categories where status = 'published' order by sort, name` as unknown as Promise<{ slug: string; name: string }[]>,
    getBooks(),
  ]);
  const core = STATIC_PAGES.filter((p) => p.group === "Core pages");
  const rest = STATIC_PAGES.filter((p) => p.group !== "Core pages");
  return [
    ...core,
    ...categories.map((c): PageEntry => ({ path: categoryPath(c.slug), label: c.name.slice(0, MAX_LABEL), group: "Categories", defaults: categoryDefaults(c) })),
    ...books.filter(visibleBook).map((b): PageEntry => ({ path: productPath(b.slug), label: b.title.slice(0, MAX_LABEL), group: "Products", defaults: productDefaults(b) })),
    ...rest,
  ];
}
