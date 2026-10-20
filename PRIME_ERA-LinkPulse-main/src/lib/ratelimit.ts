import { Ratelimit } from "@upstash/ratelimit";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getRedis } from "@/lib/cache";

export type LimitName = "create_link" | "password" | "login" | "register" | "import" | "api";

const LIMITS: Record<LimitName, { limit: number; windowSec: number }> = {
  create_link: { limit: 30, windowSec: 60 },
  password: { limit: 5, windowSec: 60 },
  login: { limit: 10, windowSec: 300 },
  register: { limit: 5, windowSec: 3600 },
  import: { limit: 5, windowSec: 60 },
  api: { limit: 120, windowSec: 60 },
};

export type LimitResult = { ok: boolean; remaining: number; resetAt: number };

const limiters = new Map<LimitName, Ratelimit>();

/**
 * Upstash sliding window when Redis is configured; otherwise an atomic fixed-window counter in
 * Postgres (INSERT ... ON CONFLICT DO UPDATE ... RETURNING), which is correct across instances.
 * Disable entirely only in tests with RATE_LIMIT_DISABLED=1.
 */
export async function rateLimit(name: LimitName, id: string): Promise<LimitResult> {
  const { limit, windowSec } = LIMITS[name];
  if (process.env.RATE_LIMIT_DISABLED === "1") return { ok: true, remaining: limit, resetAt: Date.now() };

  const redis = getRedis();
  if (redis) {
    let rl = limiters.get(name);
    if (!rl) {
      rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`), prefix: `lp:rl:${name}` });
      limiters.set(name, rl);
    }
    try {
      const r = await rl.limit(id);
      return { ok: r.success, remaining: r.remaining, resetAt: r.reset };
    } catch (err) {
      console.error("[ratelimit] redis failed, using database counter", err);
    }
  }

  const windowMs = windowSec * 1000;
  const start = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const db = await getDb();
  const res = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${`${name}:${id}`}, ${start.toISOString()}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`);
  const count = Number(res.rows[0]?.count ?? 1);
  // Opportunistic cleanup of old windows (cheap, indexed by primary key prefix scan is not needed).
  if (Math.random() < 0.01) {
    await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
  }
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt: start.getTime() + windowMs };
}
