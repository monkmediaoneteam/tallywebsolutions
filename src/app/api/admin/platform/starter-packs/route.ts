import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { sql } from "@/lib/db";
import { planStarterPacks } from "@/lib/starter-packs";
import { saveOffer } from "@/lib/offer-admin";

export const runtime = "nodejs";

const OFFER_ID = "starter-packs-5-percent";

// Creates the starter packs from the store's own products (matched by title) and a 5% pack offer.
// Safe to run twice: a pack or offer that already exists is left exactly as the admin edited it.
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin rejected." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  try {
    const books = await sql`select slug, title from books where active = true order by title` as { slug: string; title: string }[];
    const plan = planStarterPacks(books);
    let created = 0;
    const live: string[] = [];
    for (const [i, p] of plan.entries()) {
      if (!p.slugs.length) continue;
      const rows = await sql`insert into content_collections(slug,title,description,book_slugs,sort,status)
        values(${p.slug},${p.title},${p.pitch},${JSON.stringify(p.slugs)}::jsonb,${(i + 1) * 10},'published') on conflict(slug) do nothing returning slug`;
      created += rows.length;
      live.push(p.slug);
    }
    // One offer for all the packs: 5% off every product in them. Skipped if offers are not set up or it already exists.
    let offer = "skipped";
    try {
      if (live.length && !(await sql`select 1 from offers where id = ${OFFER_ID}`).length) {
        await saveOffer({ id: OFFER_ID, name: "Pack offer: 5% off", kind: "percent", scope: "collection", targets: live, value: 5, cap: null, buy_qty: null, get_qty: null,
          get_percent: null, bundle_qty: null, bundle_price: null, min_items: 0, min_subtotal: 0, code: null, combinable: false, first_order_only: false,
          usage_limit: null, per_customer_limit: null, priority: 0, starts_at: null, ends_at: null, status: "active" });
        offer = "created";
      } else offer = live.length ? "exists" : "skipped";
    } catch (error) {
      if (!/relation "offers" does not exist/.test(String((error as Error)?.message))) throw error;
    }
    const missing = new Set(plan.slice(0, -1).flatMap((p) => p.missing)).size;
    revalidatePath("/", "layout");
    revalidatePath("/admin/platform");
    const done = new URL("/admin/platform/collections", req.url);
    done.searchParams.set("packs", String(created)); done.searchParams.set("missing", String(missing)); done.searchParams.set("offer", offer);
    return NextResponse.redirect(done, 303);
  } catch (error) {
    console.error("Starter packs failed", error);
    return NextResponse.json({ error: "Could not create the packs. Reload and try again." }, { status: 503 });
  }
}
