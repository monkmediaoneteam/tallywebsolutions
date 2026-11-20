import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { readSiteSetting, saveSiteSetting, deleteSiteSetting } from "@/lib/site-settings";
import { ThemeError, cleanTheme } from "@/lib/theme";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin rejected." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  const json = (req.headers.get("content-type") ?? "").includes("application/json");
  const reply = (ok: boolean, error = "") => json ? NextResponse.json(ok ? { ok: true, to: "/admin/theme?saved=1" } : { error }, { status: ok ? 200 : 400 })
    : NextResponse.redirect(new URL(ok ? "/admin/theme?saved=1" : `/admin/theme?error=${encodeURIComponent(error)}`, req.url), 303);
  try {
    const body: Record<string, unknown> = json ? await req.json() : Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
    if ((await readSiteSetting("theme")).missing) throw new ThemeError("The site settings table is missing. Apply migration 013-site-settings.sql first.");
    if (body.action === "reset") await deleteSiteSetting("theme");
    else await saveSiteSetting("theme", cleanTheme(body.theme ?? body, true));
    revalidatePath("/", "layout"); // the theme sits in the layout, so the static pages (legal, 404) pick it up too
    return reply(true);
  } catch (error) {
    if (error instanceof ThemeError) return reply(false, error.message);
    console.error("Theme update failed", error);
    return reply(false, "Could not save. Reload and try again.");
  }
}
