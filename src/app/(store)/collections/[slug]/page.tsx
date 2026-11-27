import { permanentRedirect } from "next/navigation";

// A bundle's page is its product page.
export default async function CollectionRedirect({ params }: { params: Promise<{ slug: string }> }) { permanentRedirect(`/products/${encodeURIComponent((await params).slug)}`); }
