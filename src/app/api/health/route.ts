import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getLinkCache } from "@/lib/cache";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Liveness + configuration summary (no secrets). */
export async function GET() {
  const started = performance.now();
  let database = "ok";
  try {
    await (await getDb()).execute(sql`select 1`);
  } catch {
    database = "error";
  }
  const url = process.env.DATABASE_URL ?? "pglite";
  return NextResponse.json(
    {
      status: database === "ok" ? "ok" : "degraded",
      database,
      databaseDriver: url.startsWith("postgres") ? "postgres" : "pglite",
      cache: getLinkCache().driver,
      rateLimiter: config.upstash ? "upstash" : "postgres",
      safeBrowsing: config.safeBrowsingKey ? "enabled" : "not_configured",
      latencyMs: Math.round(performance.now() - started),
    },
    { status: database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
