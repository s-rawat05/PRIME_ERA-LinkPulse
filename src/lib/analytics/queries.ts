import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";

export type Scope = { ownerId?: string; linkId?: string; campaignId?: string; includeSynthetic?: boolean };
export type Range = { from: Date; to: Date; days: number; key: string };

const DAY = 86_400_000;

/** Ranges are whole UTC days ending today (inclusive). Custom ranges are clamped to 366 days. */
export function parseRange(params: { range?: string; from?: string; to?: string }, now = new Date()): Range {
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (params.from && params.to) {
    const f = Date.parse(params.from);
    const t = Date.parse(params.to);
    if (!Number.isNaN(f) && !Number.isNaN(t) && t >= f) {
      const from = new Date(Math.max(f, t - 365 * DAY));
      const to = new Date(t + DAY);
      return { from, to, days: Math.round((to.getTime() - from.getTime()) / DAY), key: "custom" };
    }
  }
  const map: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };
  const days = map[params.range ?? ""] ?? 30;
  return { from: new Date(todayStart - (days - 1) * DAY), to: new Date(todayStart + DAY), days, key: params.range && map[params.range] ? params.range : "30d" };
}

function where(scope: Scope, range: Range): SQL {
  const parts: SQL[] = [sql`ce.occurred_at >= ${range.from.toISOString()} AND ce.occurred_at < ${range.to.toISOString()}`];
  if (scope.ownerId) parts.push(sql`l.owner_id = ${scope.ownerId}`);
  if (scope.linkId) parts.push(sql`ce.link_id = ${scope.linkId}`);
  if (scope.campaignId) parts.push(sql`l.campaign_id = ${scope.campaignId}`);
  if (scope.includeSynthetic === false) parts.push(sql`ce.is_synthetic = false`);
  return sql.join(parts, sql` AND `);
}

// Owner-scoped queries need an inner join so events for unknown codes (no link) are excluded.
const from = (scope: Scope) =>
  scope.ownerId || scope.campaignId ? sql`click_events ce JOIN links l ON l.id = ce.link_id` : sql`click_events ce LEFT JOIN links l ON l.id = ce.link_id`;

export type Summary = {
  clicks: number; uniques: number; bots: number; qr: number; blocked: number; passwordFailed: number; notFound: number;
  limitReached: number; expired: number; disabled: number; paused: number; total: number; synthetic: number;
  p50: number | null; p95: number | null;
};

export async function getSummary(db: Db, scope: Scope, range: Range): Promise<Summary> {
  const res = await db.execute<Record<string, string | number | null>>(sql`
    SELECT
      count(*) FILTER (WHERE ce.outcome = 'redirected')::int AS clicks,
      count(DISTINCT ce.visitor_hash) FILTER (WHERE ce.outcome = 'redirected')::int AS uniques,
      count(*) FILTER (WHERE ce.outcome = 'bot')::int AS bots,
      count(*) FILTER (WHERE ce.outcome = 'redirected' AND ce.source = 'qr')::int AS qr,
      count(*) FILTER (WHERE ce.outcome NOT IN ('redirected','bot'))::int AS blocked,
      count(*) FILTER (WHERE ce.outcome = 'password_failed')::int AS password_failed,
      count(*) FILTER (WHERE ce.outcome = 'not_found')::int AS not_found,
      count(*) FILTER (WHERE ce.outcome = 'limit_reached')::int AS limit_reached,
      count(*) FILTER (WHERE ce.outcome = 'expired')::int AS expired,
      count(*) FILTER (WHERE ce.outcome = 'disabled')::int AS disabled,
      count(*) FILTER (WHERE ce.outcome = 'paused')::int AS paused,
      count(*)::int AS total,
      count(*) FILTER (WHERE ce.is_synthetic)::int AS synthetic,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ce.latency_ms) FILTER (WHERE ce.outcome IN ('redirected','bot') AND NOT ce.is_synthetic) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY ce.latency_ms) FILTER (WHERE ce.outcome IN ('redirected','bot') AND NOT ce.is_synthetic) AS p95
    FROM ${from(scope)} WHERE ${where(scope, range)}`);
  const r = res.rows[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  const p = (k: string) => (r[k] === null || r[k] === undefined ? null : Math.round(Number(r[k]) * 100) / 100);
  return {
    clicks: n("clicks"), uniques: n("uniques"), bots: n("bots"), qr: n("qr"), blocked: n("blocked"), passwordFailed: n("password_failed"),
    notFound: n("not_found"), limitReached: n("limit_reached"), expired: n("expired"), disabled: n("disabled"), paused: n("paused"),
    total: n("total"), synthetic: n("synthetic"), p50: p("p50"), p95: p("p95"),
  };
}

export type SeriesPoint = { day: string; clicks: number; uniques: number; bots: number; qr: number; blocked: number };

export async function getTimeseries(db: Db, scope: Scope, range: Range): Promise<SeriesPoint[]> {
  const res = await db.execute<{ day: string; clicks: number; uniques: number; bots: number; qr: number; blocked: number }>(sql`
    WITH days AS (
      SELECT generate_series(${range.from.toISOString()}::timestamptz, ${new Date(range.to.getTime() - DAY).toISOString()}::timestamptz, interval '1 day') AS d
    ),
    agg AS (
      SELECT date_trunc('day', ce.occurred_at AT TIME ZONE 'UTC') AS d,
        count(*) FILTER (WHERE ce.outcome = 'redirected') AS clicks,
        count(DISTINCT ce.visitor_hash) FILTER (WHERE ce.outcome = 'redirected') AS uniques,
        count(*) FILTER (WHERE ce.outcome = 'bot') AS bots,
        count(*) FILTER (WHERE ce.outcome = 'redirected' AND ce.source = 'qr') AS qr,
        count(*) FILTER (WHERE ce.outcome NOT IN ('redirected','bot')) AS blocked
      FROM ${from(scope)} WHERE ${where(scope, range)} GROUP BY 1
    )
    SELECT to_char(days.d AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      coalesce(agg.clicks, 0)::int AS clicks, coalesce(agg.uniques, 0)::int AS uniques, coalesce(agg.bots, 0)::int AS bots,
      coalesce(agg.qr, 0)::int AS qr, coalesce(agg.blocked, 0)::int AS blocked
    FROM days LEFT JOIN agg ON agg.d = date_trunc('day', days.d AT TIME ZONE 'UTC')
    ORDER BY days.d`);
  return res.rows.map((r) => ({ day: r.day, clicks: Number(r.clicks), uniques: Number(r.uniques), bots: Number(r.bots), qr: Number(r.qr), blocked: Number(r.blocked) }));
}

const DIMENSIONS = {
  referrer: sql`coalesce(ce.referrer_domain, 'Direct / none')`,
  device: sql`ce.device`,
  browser: sql`coalesce(ce.browser, 'Unknown')`,
  os: sql`coalesce(ce.os, 'Unknown')`,
  country: sql`coalesce(ce.country, 'Unknown')`,
  source: sql`ce.source::text`,
  outcome: sql`ce.outcome::text`,
} as const;
export type Dimension = keyof typeof DIMENSIONS;

/** Human clicks by dimension (outcome breakdown includes every outcome). */
export async function getBreakdown(db: Db, scope: Scope, range: Range, dim: Dimension, limit = 8) {
  const humanOnly = dim === "outcome" ? sql`` : sql` AND ce.outcome = 'redirected'`;
  const res = await db.execute<{ label: string; value: number }>(sql`
    SELECT ${DIMENSIONS[dim]} AS label, count(*)::int AS value
    FROM ${from(scope)} WHERE ${where(scope, range)}${humanOnly}
    GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${limit}`);
  return res.rows.map((r) => ({ label: String(r.label), value: Number(r.value) }));
}

export async function getTopLinks(db: Db, scope: Scope, range: Range, limit = 5) {
  const res = await db.execute<{ id: string; short_code: string; title: string | null; destination_url: string; status: string; clicks: number; uniques: number; qr: number }>(sql`
    SELECT l.id, l.short_code, l.title, l.destination_url, l.status,
      count(*) FILTER (WHERE ce.outcome = 'redirected')::int AS clicks,
      count(DISTINCT ce.visitor_hash) FILTER (WHERE ce.outcome = 'redirected')::int AS uniques,
      count(*) FILTER (WHERE ce.outcome = 'redirected' AND ce.source = 'qr')::int AS qr
    FROM click_events ce JOIN links l ON l.id = ce.link_id
    WHERE ${where(scope, range)}
    GROUP BY l.id HAVING count(*) FILTER (WHERE ce.outcome = 'redirected') > 0
    ORDER BY clicks DESC, l.short_code LIMIT ${limit}`);
  return res.rows.map((r) => ({ ...r, clicks: Number(r.clicks), uniques: Number(r.uniques), qr: Number(r.qr) }));
}

export async function getRecentEvents(db: Db, scope: Scope, limit = 12) {
  const parts: SQL[] = [sql`true`];
  if (scope.ownerId) parts.push(sql`l.owner_id = ${scope.ownerId}`);
  if (scope.linkId) parts.push(sql`ce.link_id = ${scope.linkId}`);
  const res = await db.execute<{ id: number; occurred_at: string; outcome: string; source: string; device: string; browser: string | null; os: string | null; referrer_domain: string | null; country: string | null; short_code: string | null; attempted_code: string; latency_ms: number | null; is_synthetic: boolean }>(sql`
    SELECT ce.id, ce.occurred_at, ce.outcome, ce.source, ce.device, ce.browser, ce.os, ce.referrer_domain, ce.country, l.short_code, ce.attempted_code, ce.latency_ms, ce.is_synthetic
    FROM ${from(scope)} WHERE ${sql.join(parts, sql` AND `)}
    ORDER BY ce.occurred_at DESC, ce.id DESC LIMIT ${limit}`);
  return res.rows;
}

/** Link-level alerts for an owner (or the platform when ownerId is omitted). */
export async function getLinkAlerts(db: Db, ownerId?: string) {
  const owner = ownerId ? sql`AND l.owner_id = ${ownerId}` : sql``;
  const res = await db.execute<{ kind: string; id: string; short_code: string; detail: string }>(sql`
    SELECT 'near_cap' AS kind, l.id, l.short_code, l.click_count || ' / ' || l.max_clicks || ' clicks used' AS detail
      FROM links l WHERE l.deleted_at IS NULL AND l.max_clicks IS NOT NULL AND l.click_count >= l.max_clicks * 0.8 AND l.status = 'active' ${owner}
    UNION ALL
    SELECT 'expiring', l.id, l.short_code, 'Expires ' || to_char(l.expires_at AT TIME ZONE 'UTC', 'DD Mon YYYY HH24:MI') || ' UTC'
      FROM links l WHERE l.deleted_at IS NULL AND l.expires_at > now() AND l.expires_at < now() + interval '7 days' AND l.status = 'active' ${owner}
    UNION ALL
    SELECT 'disabled', l.id, l.short_code, coalesce(l.disabled_reason, 'Disabled by administrator')
      FROM links l WHERE l.deleted_at IS NULL AND l.status = 'disabled' ${owner}
    UNION ALL
    SELECT 'password_failures', l.id, l.short_code, count(*) || ' failed password attempts in 24h'
      FROM click_events ce JOIN links l ON l.id = ce.link_id
      WHERE ce.outcome = 'password_failed' AND ce.occurred_at > now() - interval '24 hours' ${owner}
      GROUP BY l.id, l.short_code HAVING count(*) >= 5
    LIMIT 12`);
  return res.rows;
}

export async function countLinks(db: Db, ownerId?: string) {
  const owner = ownerId ? sql`AND owner_id = ${ownerId}` : sql``;
  const res = await db.execute<{ total: number; active: number; paused: number; disabled: number; expired: number }>(sql`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now()))::int AS active,
      count(*) FILTER (WHERE status = 'paused')::int AS paused,
      count(*) FILTER (WHERE status = 'disabled')::int AS disabled,
      count(*) FILTER (WHERE status <> 'disabled' AND expires_at IS NOT NULL AND expires_at <= now())::int AS expired
    FROM links WHERE deleted_at IS NULL ${owner}`);
  const r = res.rows[0];
  return { total: Number(r.total), active: Number(r.active), paused: Number(r.paused), disabled: Number(r.disabled), expired: Number(r.expired) };
}
