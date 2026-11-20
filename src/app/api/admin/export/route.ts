import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { exportOrders, ordersCsv } from "@/lib/analytics";

export const runtime = "nodejs";

/**
 * Orders as CSV. Excel opens CSV natively, so a real .xlsx writer would be a
 * dependency for no gain. ?from=YYYY-MM-DD&to=YYYY-MM-DD limits it to orders
 * started in that India-time range (the Analytics screen's current range).
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  const rows = await exportOrders(params.get("from"), params.get("to"));
  const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const [from, to] = [day(params.get("from")), day(params.get("to"))];
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + ordersCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orders-${from && to ? `${from}-to-${to}` : stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
