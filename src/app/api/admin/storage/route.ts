import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { readLimitedForm } from "@/lib/submissions";
import { deleteUnused } from "@/lib/storage";
import { blobApi } from "@/lib/storage-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const back = (req: Request, query: string) => NextResponse.redirect(new URL(`/admin/storage?${query}`, req.url), 303);

// "Delete unused files": the server works out what is unused itself (never from the browser's list) and removes only
// files no record or order uses and that are older than an hour.
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin rejected." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return back(req, `error=${encodeURIComponent("File storage is not set up yet. Connect a private Vercel Blob store to this project.")}`);
  try {
    const form = await readLimitedForm(req, 2000);
    if (form.get("action") !== "sweep" || form.get("confirmed") !== "on") return back(req, `error=${encodeURIComponent("Tick the box to confirm, then try again.")}`);
    const result = await deleteUnused(sql as never, blobApi(token));
    await sql`insert into events(order_id,type,payload) values(null,'admin.storage.swept',${JSON.stringify(result)}::jsonb)`;
    return back(req, `swept=${result.deleted}&freed=${result.bytes}`);
  } catch {
    console.error("[storage] sweep failed");
    return back(req, `error=${encodeURIComponent("Could not clean up storage. Try again in a moment.")}`);
  }
}
