import { Redis } from "@upstash/redis";
import { config } from "@/lib/config";
import type { LinkSnapshot } from "@/lib/redirect/engine";

/**
 * Link snapshot cache for the redirect hot path.
 *
 * Driver selection (CACHE_DRIVER overrides):
 *  - redis  : Upstash Redis, shared by all serverless instances (production)
 *  - memory : per-process Map, only safe for a single process (local dev, tests)
 *  - none   : always read Postgres. Production default without Redis, because a per-instance
 *             memory cache could keep serving a link after an admin takedown on another instance.
 *
 * Correctness never depends on the cache: click caps are enforced in Postgres, and every
 * mutation (edit, pause, disable, delete, blocklist change) deletes the entry in the same request.
 * Redis errors fall back to the database rather than skipping checks.
 */
export interface LinkCache {
  readonly driver: "redis" | "memory" | "none";
  get(code: string): Promise<LinkSnapshot | null | undefined>; // undefined = miss, null = cached "not found"
  set(code: string, snap: LinkSnapshot | null): Promise<void>;
  del(codes: string[]): Promise<void>;
}

const TTL_SECONDS = 60;
const NEG_TTL_SECONDS = 10;
const key = (code: string) => `lp:link:${code}`;

class MemoryCache implements LinkCache {
  readonly driver = "memory" as const;
  private map = new Map<string, { v: LinkSnapshot | null; exp: number }>();
  async get(code: string) {
    const hit = this.map.get(code);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.map.delete(code);
      return undefined;
    }
    return hit.v;
  }
  async set(code: string, v: LinkSnapshot | null) {
    this.map.set(code, { v, exp: Date.now() + (v ? TTL_SECONDS : NEG_TTL_SECONDS) * 1000 });
  }
  async del(codes: string[]) {
    for (const c of codes) this.map.delete(c);
  }
  /** test helper */
  has(code: string) {
    return this.map.has(code);
  }
}

class NoCache implements LinkCache {
  readonly driver = "none" as const;
  async get() {
    return undefined;
  }
  async set() {}
  async del() {}
}

class RedisCache implements LinkCache {
  readonly driver = "redis" as const;
  constructor(private redis: Redis) {}
  async get(code: string) {
    try {
      const v = await this.redis.get<{ v: LinkSnapshot | null }>(key(code));
      return v ? v.v : undefined;
    } catch (err) {
      console.error("[cache] redis get failed, falling back to DB", err);
      return undefined;
    }
  }
  async set(code: string, v: LinkSnapshot | null) {
    try {
      await this.redis.set(key(code), { v }, { ex: v ? TTL_SECONDS : NEG_TTL_SECONDS });
    } catch (err) {
      console.error("[cache] redis set failed", err);
    }
  }
  async del(codes: string[]) {
    if (!codes.length) return;
    // A failed delete must surface: the caller's mutation is already committed, and a stale
    // entry would keep redirecting. TTL bounds the damage to TTL_SECONDS in the worst case.
    await this.redis.del(...codes.map(key));
  }
}

const g = globalThis as unknown as { __lpCache?: LinkCache; __lpRedis?: Redis | null };

export function getRedis(): Redis | null {
  if (g.__lpRedis === undefined) {
    const up = config.upstash;
    g.__lpRedis = up ? new Redis({ url: up.url, token: up.token }) : null;
  }
  return g.__lpRedis;
}

export function getLinkCache(): LinkCache {
  if (g.__lpCache) return g.__lpCache;
  const forced = process.env.CACHE_DRIVER;
  const redis = getRedis();
  if ((forced === "redis" || !forced) && redis) g.__lpCache = new RedisCache(redis);
  else if (forced === "memory" || (!forced && !config.isProd)) g.__lpCache = new MemoryCache();
  else g.__lpCache = new NoCache();
  return g.__lpCache;
}

export async function invalidateLinks(codes: (string | null | undefined)[]) {
  const list = [...new Set(codes.filter((c): c is string => !!c))];
  if (list.length) await getLinkCache().del(list);
}
