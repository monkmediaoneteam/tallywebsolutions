import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { sql } from "@/lib/db";
import { planStarterPacks } from "@/lib/starter-packs";

export const runtime = "nodejs";

// Creates the starter packs from the store's own products (matched by title).
// Safe to run twice: a pack that already exists is left exactly as the admin edited it.
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
    // The pack price (a percent off when the whole pack is bought) is built in: see lib/packs.ts. Nothing to set up here.
    const missing = new Set(plan.slice(0, -1).flatMap((p) => p.missing)).size;
    revalidatePath("/", "layout");
    revalidatePath("/admin/platform");
    const done = new URL("/admin/platform/collections", req.url);
    done.searchParams.set("packs", String(created)); done.searchParams.set("missing", String(missing));
    return NextResponse.redirect(done, 303);
  } catch (error) {
    console.error("Starter packs failed", error);
    return NextResponse.json({ error: "Could not create the packs. Reload and try again." }, { status: 503 });
  }
}
