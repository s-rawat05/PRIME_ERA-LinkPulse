import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { requirePageAdmin } from "@/lib/auth/session";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { LiveRefresh, RangePicker } from "@/components/dashboard/controls";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { abuseAlerts } from "@/lib/admin/service";
import { countLinks, getLinkAlerts, parseRange } from "@/lib/analytics/queries";
import { rollupConsistency, rollupDaily } from "@/lib/analytics/rollup";
import { getLinkCache } from "@/lib/cache";
import { formatNumber } from "@/lib/cn";

export const metadata: Metadata = { title: "Platform" };

const SIGNAL: Record<string, string> = {
  password_bruteforce: "Many failed passwords (24h)",
  traffic_spike: "Traffic spike (24h)",
  blocked_hits: "Repeated hits on a disabled link",
};

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageAdmin();
  const sp = await searchParams;
  const db = await getDb();
  const range = parseRange({ range: sp.range ?? "7d" });
  // Keep rollups fresh when an admin looks (the cron does this on Vercel); then verify them against raw events.
  await rollupDaily(db, 2);
  const [counts, users, abuse, alerts, consistency] = await Promise.all([
    countLinks(db),
    db.execute<{ total: number; admins: number; disabled: number }>(sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE role = 'admin')::int AS admins, count(*) FILTER (WHERE disabled_at IS NOT NULL)::int AS disabled FROM users`),
    abuseAlerts(db),
    getLinkAlerts(db),
    rollupConsistency(db, 2),
  ]);
  const u = users.rows[0];

  return (
    <>
      <PageHeader title="Platform overview" description="Platform-wide analytics, including visits to unknown codes and every blocked outcome." actions={<LiveRefresh />} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Users", `${formatNumber(Number(u.total))}`, `${u.admins} admins · ${u.disabled} disabled`, "/dashboard/admin/users"],
          ["Links", formatNumber(counts.total), `${counts.active} active · ${counts.paused} paused`, "/dashboard/admin/links"],
          ["Disabled links", formatNumber(counts.disabled), "Admin takedowns", "/dashboard/admin/links?status=disabled"],
          ["Cache", getLinkCache().driver, "Hot-path link snapshot cache", "/dashboard/settings"],
        ].map(([k, v, h, href]) => (
          <Link key={k} href={href} className="rounded-[var(--radius-xl2)] border border-line bg-white p-4 shadow-[var(--shadow-card)] hover:border-pulse-200">
            <p className="text-[12.5px] text-ink-faint">{k}</p>
            <p className="mt-1 text-2xl font-semibold text-ink capitalize">{v}</p>
            <p className="text-[12px] text-ink-faint">{h}</p>
          </Link>
        ))}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Abuse monitoring" description="Signals computed from the last 24 hours of events" />
          <ul className="grid gap-2 p-4">
            {abuse.signals.length === 0 && abuse.flagged.length === 0 && <li className="rounded-xl bg-emerald-50 px-3 py-3 text-[13px] text-emerald-700">No abuse signals right now.</li>}
            {abuse.signals.map((s) => (
              <li key={`${s.kind}-${s.link_id}`}>
                <Link href={`/dashboard/admin/links?q=${s.short_code}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:border-pulse-200">
                  <ShieldAlert className="size-4 text-red-600" />
                  <span className="font-mono text-[12.5px]">/{s.short_code}</span>
                  <span className="truncate text-[12.5px] text-ink-soft">{SIGNAL[s.kind] ?? s.kind} · {s.destination_host}</span>
                  <Badge tone="disabled" className="ml-auto">{s.n}</Badge>
                </Link>
              </li>
            ))}
            {abuse.flagged.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl border border-red-200 px-3 py-2.5 text-[12.5px]">
                <AlertTriangle className="size-4 text-red-600" /> /{f.shortCode} flagged by Safe Browsing ({f.host})
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Link alerts & data integrity" />
          <div className="grid gap-2 p-4">
            <p className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] ${consistency.consistent ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {consistency.consistent ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
              Daily rollups {consistency.consistent ? "match" : "do not match"} raw events (last 2 days): {consistency.rolled} vs {consistency.raw} human clicks
            </p>
            {alerts.slice(0, 6).map((a) => (
              <Link key={`${a.kind}-${a.id}`} href={`/dashboard/links/${a.id}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-[12.5px] hover:border-pulse-200">
                <span className="font-mono">/{a.short_code}</span>
                <span className="ml-auto truncate text-ink-soft">{a.detail}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-4 flex justify-end"><RangePicker current={range.key} /></div>
      <AnalyticsPanel scope={{ includeSynthetic: sp.real !== "1" }} range={range} />
    </>
  );
}
