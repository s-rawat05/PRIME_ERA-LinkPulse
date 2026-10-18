import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { rollupConsistency, rollupDaily } from "@/lib/analytics/rollup";
import { config } from "@/lib/config";

/** Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = config.cronSecret;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const upserted = await rollupDaily(db, 3);
  const check = await rollupConsistency(db, 3);
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
  return NextResponse.json({ upserted, check });
}
