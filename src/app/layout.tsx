import type { Metadata } from "next";
import "./globals.css";
import "@fontsource-variable/geist";
import { STORE, siteUrl } from "@/lib/store";
import { getPageSeo } from "@/lib/seo-store";

const SITE = siteUrl();
// Site-wide defaults come from Admin > SEO (title template, site name, description, social image); built-in values apply until set.
export async function generateMetadata(): Promise<Metadata> {
  const { site } = await getPageSeo("*");
  const name = site.siteName || STORE.name;
  return {
    metadataBase: new URL(SITE),
    title: { default: name, template: site.titleTemplate || `%s | ${name}` },
    description: site.description || STORE.tagline,
    openGraph: { type: "website", siteName: name, url: SITE, ...(site.ogImage ? { images: [site.ogImage] } : {}) },
    robots: site.robots || { index: true, follow: true },
  };
}

// Only the document shell lives here: the storefront frame (and its database reads) is in (store)/layout.tsx,
// so admin pages do not pay for the shop header on every navigation.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} /></head>
    <body>{children}</body></html>;
}
