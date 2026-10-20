import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { clickEvents, links, redirectRules } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { getLinkCache } from "@/lib/cache";
import { normalizeIncomingCode } from "@/lib/links/codes";
import { blockedHostSet } from "@/lib/links/safety";
import { referrerDomain } from "@/lib/links/url";
import { rateLimit } from "@/lib/ratelimit";
import { classifyUserAgent, clientIp, geoFromHeaders, ipKey, visitorHash } from "./classify";
import { evaluate, type Evaluation, type LinkSnapshot, type Outcome } from "./engine";

export type ClickEventInsert = typeof clickEvents.$inferInsert;

export type PageKind = "not_found" | "disabled" | "paused" | "expired" | "limit_reached" | "password" | "rate_limited";

export type RedirectResult = {
  status: number;
  location: string | null;
  page: { kind: PageKind; code: string; error?: string; qr?: boolean } | null;
  outcome: Outcome | null;
  event: ClickEventInsert | null;
  /** True when the click was already counted atomically (capped link); otherwise the logger increments. */
  countedInline: boolean;
  evaluation: Evaluation;
  cache: "hit" | "miss" | "bypass";
};

export async function loadSnapshot(db: Db, code: string): Promise<LinkSnapshot | null> {
  const [l] = await db.select().from(links).where(and(eq(links.shortCode, code), isNull(links.deletedAt))).limit(1);
  if (!l) return null;
  const rules = await db.select().from(redirectRules).where(eq(redirectRules.linkId, l.id));
  const blocked = await blockedHostSet(db, [l.destinationHost, ...rules.map((r) => r.targetHost)]);
  return {
    id: l.id,
    shortCode: l.shortCode,
    destinationUrl: l.destinationUrl,
    status: l.status,
    blocked: blocked.has(l.destinationHost),
    disabledReason: l.disabledReason,
    expiresAt: l.expiresAt ? l.expiresAt.getTime() : null,
    expiredUrl: l.expiredUrl,
    maxClicks: l.maxClicks,
    clickCount: l.clickCount,
    hasPassword: !!l.passwordHash,
    rules: rules.map((r) => ({ id: r.id, priority: r.priority, conditionType: r.conditionType, conditionValue: r.conditionValue, targetUrl: r.targetUrl, blocked: blocked.has(r.targetHost) })),
  };
}

export type RedirectInput = {
  code: string;
  method: string;
  headers: Headers;
  searchParams: URLSearchParams;
  password?: string | null;
  now?: number;
};

/**
 * Executes the redirect for one request. Returns the HTTP decision immediately; the click event is
 * returned (not written) so the route can persist it after the response with `after()`.
 */
export async function handleRedirect(db: Db, input: RedirectInput): Promise<RedirectResult> {
  const started = performance.now();
  const now = input.now ?? Date.now();
  const ua = input.headers.get("user-agent") ?? "";
  const client = classifyUserAgent(ua, input.method);
  const geo = geoFromHeaders(input.headers);
  const ip = clientIp(input.headers);
  const qr = input.searchParams.get("s") === "qr";
  const code = normalizeIncomingCode(input.code);

  // 1. Resolve: cache first, Postgres on a miss, then refill the cache.
  const cache = getLinkCache();
  let snap: LinkSnapshot | null = null;
  let cacheState: RedirectResult["cache"] = cache.driver === "none" ? "bypass" : "miss";
  if (code) {
    const cached = await cache.get(code);
    if (cached !== undefined) {
      snap = cached;
      cacheState = "hit";
    } else {
      snap = await loadSnapshot(db, code);
      await cache.set(code, snap);
    }
  }

  // 5 (input). Verify a submitted password only when the link actually needs one; rate-limited per visitor+link.
  let password: "none" | "correct" | "wrong" = "none";
  if (snap?.hasPassword && input.password != null && input.method === "POST") {
    const rl = await rateLimit("password", `${snap.id}:${ipKey(ip)}`);
    if (!rl.ok) {
      const evaluation = evaluate(snap, { now, isBot: client.isBot, device: client.device, os: client.os, country: geo.country, password: "none" });
      return { status: 429, location: null, page: { kind: "rate_limited", code: snap.shortCode, qr }, outcome: null, event: null, countedInline: false, evaluation, cache: cacheState };
    }
    const [row] = await db.select({ h: links.passwordHash }).from(links).where(eq(links.id, snap.id)).limit(1);
    password = row?.h && (await verifyPassword(input.password, row.h)) ? "correct" : "wrong";
  }

  const evaluation = evaluate(snap, { now, isBot: client.isBot, device: client.device, os: client.os, country: geo.country, password });
  let d = evaluation.decision;

  // 7. Click cap: one conditional UPDATE. Zero rows means the cap was hit (or the link changed state).
  let countedInline = false;
  if (d.kind === "redirect" && d.consumeCap && snap) {
    const res = await db.execute<{ click_count: number }>(sql`
      UPDATE links SET click_count = click_count + 1
      WHERE id = ${snap.id} AND max_clicks IS NOT NULL AND click_count < max_clicks
        AND status = 'active' AND deleted_at IS NULL
      RETURNING click_count`);
    if (res.rows.length === 0) {
      d = { kind: "block", outcome: "limit_reached", status: 410 };
      const s7 = evaluation.steps[6];
      s7.result = "block";
      s7.detail = `Click cap of ${snap.maxClicks} reached; atomic UPDATE matched 0 rows.`;
      for (const s of evaluation.steps.slice(7)) {
        s.result = "skip";
        s.detail = "Not evaluated: an earlier rule decided the outcome.";
      }
      evaluation.decision = d;
    } else {
      countedInline = true;
    }
  }

  const latencyMs = Math.round((performance.now() - started) * 100) / 100;
  const outcome: Outcome | null = d.outcome;
  const event: ClickEventInsert | null = outcome
    ? {
        linkId: snap?.id ?? null,
        attemptedCode: (code ?? input.code).slice(0, 64),
        occurredAt: new Date(now),
        outcome,
        source: qr ? "qr" : "link",
        isBot: client.isBot,
        referrerDomain: referrerDomain(input.headers.get("referer")),
        country: geo.country,
        city: geo.city,
        device: client.device,
        os: client.os,
        browser: client.browser,
        ruleId: d.kind === "redirect" ? d.ruleId : null,
        visitorHash: visitorHash(snap?.id ?? null, ip, ua, now),
        latencyMs,
      }
    : null;

  const base = { outcome, event, countedInline, evaluation, cache: cacheState };
  switch (d.kind) {
    case "redirect":
    case "redirect_expired":
      return { ...base, status: 302, location: d.destination, page: null };
    case "password":
      return { ...base, status: 401, location: null, page: { kind: "password", code: snap!.shortCode, error: d.error ? "Incorrect password. Please try again." : undefined, qr } };
    case "block":
      return { ...base, status: d.status, location: null, page: { kind: d.outcome, code: code ?? input.code.slice(0, 64), qr } };
  }
}

/**
 * Persists the click event (and, for uncapped human clicks, the denormalised counter).
 * Called from `after()` so redirect latency is unaffected; on Vercel `after()` is backed by waitUntil.
 */
export async function recordClick(db: Db, r: Pick<RedirectResult, "event" | "countedInline">) {
  if (!r.event) return;
  await db.insert(clickEvents).values(r.event);
  if (r.event.outcome === "redirected" && !r.countedInline && r.event.linkId) {
    await db.execute(sql`UPDATE links SET click_count = click_count + 1 WHERE id = ${r.event.linkId}`);
  }
}
