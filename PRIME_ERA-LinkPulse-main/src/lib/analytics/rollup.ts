import { sql } from "drizzle-orm";
import type { Db } from "@/db";

/**
 * Recomputes link_stats_daily for the last `days` UTC days from raw click_events.
 * Idempotent (upsert), so the cron can safely re-run; raw events remain the source of truth.
 */
export async function rollupDaily(db: Db, days = 2) {
  const res = await db.execute<{ n: number }>(sql`
    WITH agg AS (
      SELECT ce.link_id, (ce.occurred_at AT TIME ZONE 'UTC')::date AS day,
        count(*) FILTER (WHERE ce.outcome = 'redirected')::int AS clicks,
        count(DISTINCT ce.visitor_hash) FILTER (WHERE ce.outcome = 'redirected')::int AS uniques,
        count(*) FILTER (WHERE ce.outcome = 'bot')::int AS bot_hits,
        count(*) FILTER (WHERE ce.outcome = 'redirected' AND ce.source = 'qr')::int AS qr_scans,
        count(*) FILTER (WHERE ce.outcome NOT IN ('redirected','bot'))::int AS blocked
      FROM click_events ce
      WHERE ce.link_id IS NOT NULL AND ce.occurred_at >= (now() AT TIME ZONE 'UTC')::date - ${days - 1}::int
      GROUP BY 1, 2
    ), up AS (
      INSERT INTO link_stats_daily (link_id, day, clicks, uniques, bot_hits, qr_scans, blocked, updated_at)
      SELECT link_id, day, clicks, uniques, bot_hits, qr_scans, blocked, now() FROM agg
      ON CONFLICT (link_id, day) DO UPDATE SET clicks = EXCLUDED.clicks, uniques = EXCLUDED.uniques,
        bot_hits = EXCLUDED.bot_hits, qr_scans = EXCLUDED.qr_scans, blocked = EXCLUDED.blocked, updated_at = now()
      RETURNING 1
    ) SELECT count(*)::int AS n FROM up`);
  return Number(res.rows[0]?.n ?? 0);
}

/** Verifies rollup totals equal raw event counts for the covered days (used by tests and the admin page). */
export async function rollupConsistency(db: Db, days = 2) {
  const res = await db.execute<{ raw: number; rolled: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM click_events WHERE link_id IS NOT NULL AND outcome = 'redirected'
         AND occurred_at >= (now() AT TIME ZONE 'UTC')::date - ${days - 1}::int) AS raw,
      (SELECT coalesce(sum(clicks), 0)::int FROM link_stats_daily
         WHERE day >= (now() AT TIME ZONE 'UTC')::date - ${days - 1}::int) AS rolled`);
  const r = res.rows[0];
  return { raw: Number(r.raw), rolled: Number(r.rolled), consistent: Number(r.raw) === Number(r.rolled) };
}
