import { getBooks } from "@/lib/db";
import { flag } from "@/lib/env";
import { publicBook, visibleBook } from "@/components/book-data";
import CartContents from "./CartContents";
import { seoMetadata } from "@/lib/seo-meta";

export const dynamic = "force-dynamic";
export async function generateMetadata() { return seoMetadata("/cart"); }

export default async function CartPage() {
  const books = (await getBooks()).filter(visibleBook).map((book) => publicBook(book));
  return <div className="wrap section"><div className="page-heading"><p className="eyebrow">Your order</p><h1>Your bag</h1></div>
    <CartContents books={books} enabled={flag("COMMERCE_ENABLED")} />
  </div>;
}
