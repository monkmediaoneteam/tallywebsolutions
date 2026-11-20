import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { readLimitedForm } from "@/lib/submissions";
import { isSeoPath, parsePageSeo, parseSiteSeo, SeoError } from "@/lib/seo";
import { resetSeo, saveSeo, isMissingTable } from "@/lib/seo-store";

export const runtime = "nodejs";

// Saves or resets one page's SEO. Browser forms are redirected back to the same page; the manager's script asks for JSON
// so that an error keeps everything the admin typed.
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin rejected." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  const json = req.headers.get("accept")?.includes("application/json");
  let path = "/";
  const fail = (message: string, status: number) => json
    ? NextResponse.json({ error: message }, { status })
    : NextResponse.redirect(new URL(`/admin/seo?page=${encodeURIComponent(path)}&error=${encodeURIComponent(message)}`, req.url), 303);
  try {
    const form = await readLimitedForm(req, 60000);
    const raw = String(form.get("path") ?? "");
    if (!isSeoPath(raw)) return fail("Unknown page.", 400);
    path = raw;
    const action = form.get("action");
    if (action === "reset") await resetSeo(path);
    else if (action === "save") {
      const input = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
      const data = path === "*" ? parseSiteSeo(input) : parsePageSeo(input);
      // Nothing customised any more: remove the row so the page falls back to its defaults.
      if (Object.keys(data).length) await saveSeo(path, data); else await resetSeo(path);
    } else return fail("Unknown action.", 400);
    revalidatePath("/", "layout");
    const done = `/admin/seo?page=${encodeURIComponent(path)}&saved=${action === "reset" ? "reset" : "1"}`;
    return json ? NextResponse.json({ ok: true, to: done }) : NextResponse.redirect(new URL(done, req.url), 303);
  } catch (error) {
    if (error instanceof SeoError) return fail(error.message, 400);
    if (isMissingTable(error)) return fail("The SEO table is not set up yet. Apply migration 012-seo-pages.sql first.", 503);
    console.error("SEO save failed");
    return fail("Could not save. Reload and try again.", 503);
  }
}
