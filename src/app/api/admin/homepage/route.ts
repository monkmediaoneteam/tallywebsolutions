import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { readSiteSetting, saveSiteSetting, deleteSiteSetting } from "@/lib/site-settings";
import { SectionError, cleanLayout, defaultLayout, type Layout } from "@/lib/home-sections";
import { addSection, duplicateSection, moveSection, removeSection, saveSection, toggleSection } from "@/lib/home-layout-ops";

export const runtime = "nodejs";

// Every homepage edit: the form posts (list actions) redirect back with a notice; the editor posts JSON and gets JSON,
// so an error leaves the typed values on screen.
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin rejected." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  const json = (req.headers.get("content-type") ?? "").includes("application/json");
  let input: Record<string, unknown> = {};
  let back = "/admin/homepage";
  try {
    if (json) input = await req.json();
    else { const form = await req.formData(); input = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""])); }
    const action = String(input.action ?? ""), id = String(input.id ?? "");
    if (id) back = `/admin/homepage/${encodeURIComponent(id)}`;
    if (action !== "save" && action !== "add" && action !== "duplicate") back = "/admin/homepage";
    const stored = await readSiteSetting("home_layout");
    if (stored.missing) throw new SectionError("The site settings table is missing. Apply migration 013-site-settings.sql first.");
    let layout: Layout = stored.value ? cleanLayout(stored.value, false) : defaultLayout();
    if (!layout.sections.length) layout = defaultLayout();
    let go = "/admin/homepage";
    if (action === "reset") { await deleteSiteSetting("home_layout"); revalidatePath("/"); return reply(json, req, go, true); }
    else if (action === "add") { const r = addSection(layout, String(input.type ?? ""), input.position ? String(input.position) : undefined); layout = r.layout; go = `/admin/homepage/${r.id}`; }
    else if (action === "duplicate") { const r = duplicateSection(layout, id); layout = r.layout; go = `/admin/homepage/${r.id}`; }
    else if (action === "move") layout = moveSection(layout, id, String(input.direction ?? ""));
    else if (action === "toggle") layout = toggleSection(layout, id, input.enabled === undefined ? undefined : input.enabled === true || input.enabled === "1");
    else if (action === "delete") layout = removeSection(layout, id);
    else if (action === "save") { layout = saveSection(layout, id, { settings: input.settings, blocks: input.blocks }); go = `/admin/homepage/${id}`; }
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    layout = cleanLayout(layout, true);
    await saveSiteSetting("home_layout", layout);
    revalidatePath("/");
    return reply(json, req, go, true);
  } catch (error) {
    if (error instanceof SectionError) return reply(json, req, back, false, error.message);
    console.error("Homepage update failed", error);
    return reply(json, req, back, false, "Could not save. Reload and try again.");
  }
}

function reply(json: boolean, req: Request, to: string, ok: boolean, error = "") {
  if (json) return NextResponse.json(ok ? { ok: true, to: `${to}?saved=1` } : { error }, { status: ok ? 200 : 400 });
  return NextResponse.redirect(new URL(ok ? `${to}${to === "/admin/homepage" ? "?saved=1" : ""}` : `${to}?error=${encodeURIComponent(error)}`, req.url), 303);
}
