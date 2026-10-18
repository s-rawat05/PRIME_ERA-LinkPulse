import Link from "next/link";
import { Activity, Bot, Gauge, MousePointerClick, QrCode, ShieldX, Users } from "lucide-react";
import type { ReactNode } from "react";
import { getDb } from "@/db";
import { getBreakdown, getRecentEvents, getSummary, getTimeseries, getTopLinks, type Range, type Scope } from "@/lib/analytics/queries";
import { formatNumber, timeAgo } from "@/lib/cn";
import { Badge, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { DonutChart, TrendChart } from "./charts";

export function StatCard({ label, value, hint, icon, accent }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; accent?: boolean }) {
  return (
    <div className={accent ? "rounded-[var(--radius-xl2)] bg-gradient-to-br from-pulse-500 to-pulse-700 p-5 text-white shadow-[var(--shadow-lift)]" : "rounded-[var(--radius-xl2)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"}>
      <div className="flex items-center justify-between">
        <p className={accent ? "text-[13px] text-white/80" : "text-[13px] text-ink-faint"}>{label}</p>
        <span className={accent ? "grid size-8 place-items-center rounded-full bg-white/20" : "grid size-8 place-items-center rounded-full bg-pulse-50 text-pulse-600"}>{icon}</span>
      </div>
      <p className="mt-3 text-[28px] leading-none font-semibold tracking-tight">{value}</p>
      {hint && <p className={accent ? "mt-2 text-[12px] text-white/75" : "mt-2 text-[12px] text-ink-faint"}>{hint}</p>}
    </div>
  );
}

export function BarList({ items, empty = "No data yet" }: { items: { label: string; value: number; href?: string }[]; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-[13px] text-ink-faint">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {items.map((i) => (
        <li key={i.label} className="relative">
          <div className="absolute inset-y-0 left-0 rounded-lg bg-pulse-50" style={{ width: `${(i.value / max) * 100}%` }} aria-hidden />
          <div className="relative flex items-center justify-between gap-3 px-2.5 py-1.5 text-[13px]">
            {i.href ? (
              <Link href={i.href} className="truncate font-medium text-ink hover:text-pulse-700">{i.label}</Link>
            ) : (
              <span className="truncate text-ink-soft">{i.label}</span>
            )}
            <span className="font-semibold text-ink tabular-nums">{formatNumber(i.value)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Full analytics block for any scope. Every number is a query over persisted click events. */
export async function AnalyticsPanel({ scope, range, showTopLinks = true, showRecent = true }: { scope: Scope; range: Range; showTopLinks?: boolean; showRecent?: boolean }) {
  const db = await getDb();
  const [summary, series, referrers, devices, browsers, os, countries, outcomes, top, recent] = await Promise.all([
    getSummary(db, scope, range),
    getTimeseries(db, scope, range),
    getBreakdown(db, scope, range, "referrer"),
    getBreakdown(db, scope, range, "device", 5),
    getBreakdown(db, scope, range, "browser"),
    getBreakdown(db, scope, range, "os"),
    getBreakdown(db, scope, range, "country"),
    getBreakdown(db, scope, range, "outcome", 10),
    showTopLinks ? getTopLinks(db, scope, range, 6) : Promise.resolve([]),
    showRecent ? getRecentEvents(db, scope, 10) : Promise.resolve([]),
  ]);

  const qrShare = summary.clicks ? Math.round((summary.qr / summary.clicks) * 100) : 0;

  return (
    <div className="grid gap-4">
      {summary.synthetic > 0 && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
          This view includes <strong>{formatNumber(summary.synthetic)}</strong> synthetic demo events from the seed script. Tick “Exclude demo data” to see only real traffic.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard accent label="Human clicks" value={formatNumber(summary.clicks)} icon={<MousePointerClick className="size-4" />} hint={`${formatNumber(summary.total)} total visits recorded`} />
        <StatCard label="Unique visitors" value={formatNumber(summary.uniques)} icon={<Users className="size-4" />} hint="Daily-unique, privacy-preserving" />
        <StatCard label="Bots filtered" value={formatNumber(summary.bots)} icon={<Bot className="size-4" />} hint="Not counted as clicks" />
        <StatCard label="Redirect p95" value={summary.p95 === null ? "—" : `${summary.p95} ms`} icon={<Gauge className="size-4" />} hint={summary.p50 === null ? "No real redirects in range" : `p50 ${summary.p50} ms · server-side`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Clicks over time" description="Human clicks, unique visitors and filtered bots per UTC day" />
          <div className="px-3 pt-2 pb-4">
            {summary.total === 0 ? (
              <EmptyState icon={<Activity className="size-6" />} title="No visits in this range" description="Share a short link or QR code; visits appear here within seconds." />
            ) : (
              <TrendChart data={series} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Devices" description="Human clicks by device class" />
          <div className="px-5 py-5">{devices.length ? <DonutChart data={devices} label="Devices" /> : <p className="py-6 text-center text-[13px] text-ink-faint">No clicks yet</p>}</div>
          <div className="grid grid-cols-2 gap-3 border-t border-line px-5 py-4 text-[13px]">
            <div className="flex items-center gap-2 text-ink-soft"><QrCode className="size-4 text-sky-600" /> QR clicks <span className="ml-auto font-semibold text-ink">{summary.qr} · {qrShare}%</span></div>
            <div className="flex items-center gap-2 text-ink-soft"><ShieldX className="size-4 text-red-500" /> Blocked <span className="ml-auto font-semibold text-ink">{summary.blocked}</span></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Top referrers" />
          <div className="p-4"><BarList items={referrers} /></div>
        </Card>
        <Card>
          <CardHeader title="Browsers" />
          <div className="p-4"><BarList items={browsers} /></div>
        </Card>
        <Card>
          <CardHeader title="Operating systems" />
          <div className="p-4"><BarList items={os} /></div>
        </Card>
        <Card>
          <CardHeader title="Visit outcomes" description="Every visit, including blocked ones" />
          <div className="p-4"><BarList items={outcomes.map((o) => ({ ...o, label: o.label }))} /></div>
        </Card>
        <Card>
          <CardHeader title="Countries" description="From platform geo headers when available" />
          <div className="p-4"><BarList items={countries} empty="Location is recorded only when the host provides it" /></div>
        </Card>
        {showTopLinks && (
          <Card>
            <CardHeader title="Top links" />
            <div className="p-4">
              <BarList items={top.map((t) => ({ label: `/${t.short_code}`, value: t.clicks, href: `/dashboard/links/${t.id}` }))} />
            </div>
          </Card>
        )}
      </div>

      {showRecent && (
        <Card>
          <CardHeader title="Recent visits" description="Latest persisted click events (all outcomes)" />
          <div className="overflow-x-auto p-2">
            {recent.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-ink-faint">No visits recorded yet.</p>
            ) : (
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="text-[11.5px] text-ink-faint uppercase">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Link</th>
                    <th className="px-3 py-2 font-medium">Outcome</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Device</th>
                    <th className="px-3 py-2 font-medium">Referrer</th>
                    <th className="px-3 py-2 text-right font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <td className="px-3 py-2 whitespace-nowrap text-ink-soft">{timeAgo(e.occurred_at)}{e.is_synthetic && <Badge tone="demo" className="ml-2">demo</Badge>}</td>
                      <td className="px-3 py-2 font-mono text-[12.5px] text-ink">/{e.short_code ?? e.attempted_code}</td>
                      <td className="px-3 py-2"><StatusBadge status={e.outcome} /></td>
                      <td className="px-3 py-2">{e.source === "qr" ? <Badge tone="qr">QR</Badge> : <span className="text-ink-faint">link</span>}</td>
                      <td className="px-3 py-2 text-ink-soft capitalize">{e.device}{e.browser ? ` · ${e.browser}` : ""}</td>
                      <td className="px-3 py-2 text-ink-soft">{e.referrer_domain ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-ink-soft tabular-nums">{e.latency_ms !== null ? `${Number(e.latency_ms).toFixed(1)} ms` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
