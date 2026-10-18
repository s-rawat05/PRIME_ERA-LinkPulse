import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Gauge, KeyRound, Link2, Megaphone, Plus, ShieldOff } from "lucide-react";
import { getDb } from "@/db";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { LiveRefresh, RangePicker } from "@/components/dashboard/controls";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { countLinks, getLinkAlerts, parseRange } from "@/lib/analytics/queries";
import { requirePageUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/cn";
import { listCampaigns } from "@/lib/org/service";

export const metadata: Metadata = { title: "Overview" };

const ALERT_ICON = { near_cap: Gauge, expiring: CalendarClock, disabled: ShieldOff, password_failures: KeyRound } as const;

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const range = parseRange({ range: sp.range ?? "7d" });
  const db = await getDb();
  const [counts, alerts, campaigns] = await Promise.all([countLinks(db, user.id), getLinkAlerts(db, user.id), listCampaigns(db, user.id)]);

  return (
    <>
      {sp.denied === "admin" && <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800 ring-1 ring-amber-200">That area is restricted to administrators.</p>}
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description="Live performance of your links, from persisted click events."
        actions={
          <>
            <LiveRefresh />
            <ButtonLink href="/dashboard/links/new" variant="blue"><Plus className="size-4" /> Create link</ButtonLink>
          </>
        }
      />

      {counts.total === 0 ? (
        <Card>
          <EmptyState
            icon={<Link2 className="size-6" />}
            title="Create your first short link"
            description="Paste a long URL, pick an alias and rules, and share it as a link or QR code. Analytics appear here as soon as someone clicks."
            action={<ButtonLink href="/dashboard/links/new" variant="blue"><Plus className="size-4" /> Create link</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-[13px]">
              {[
                ["Links", counts.total, "/dashboard/links"],
                ["Active", counts.active, "/dashboard/links?status=active"],
                ["Paused", counts.paused, "/dashboard/links?status=paused"],
                ["Expired", counts.expired, "/dashboard/links?status=expired"],
                ["Disabled", counts.disabled, "/dashboard/links?status=disabled"],
              ].map(([k, v, href]) => (
                <Link key={k as string} href={href as string} className="rounded-full border border-line bg-white px-3 py-1.5 text-ink-soft hover:border-pulse-200">
                  {k} <span className="ml-1 font-semibold text-ink">{v as number}</span>
                </Link>
              ))}
            </div>
            <RangePicker current={range.key} />
          </div>

          <AnalyticsPanel scope={{ ownerId: user.id, includeSynthetic: sp.real !== "1" }} range={range} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Campaign performance" description="All-time human clicks" action={<Link href="/dashboard/campaigns" className="text-[13px] font-medium text-pulse-700">View all</Link>} />
              <div className="p-2">
                {campaigns.length === 0 ? (
                  <EmptyState icon={<Megaphone className="size-6" />} title="No campaigns yet" description="Group links into campaigns to compare performance." action={<ButtonLink href="/dashboard/campaigns" variant="secondary" size="sm">Create campaign</ButtonLink>} />
                ) : (
                  <table className="w-full text-[13px]">
                    <thead className="text-left text-[11.5px] text-ink-faint uppercase">
                      <tr><th className="px-3 py-2 font-medium">Campaign</th><th className="px-3 py-2 text-right font-medium">Links</th><th className="px-3 py-2 text-right font-medium">Clicks</th><th className="px-3 py-2 text-right font-medium">Top link</th></tr>
                    </thead>
                    <tbody>
                      {campaigns.slice(0, 6).map((c) => (
                        <tr key={c.id} className="border-t border-line">
                          <td className="px-3 py-2.5"><Link href={`/dashboard/campaigns/${c.id}`} className="font-medium text-ink hover:text-pulse-700">{c.name}</Link></td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{c.link_count}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatNumber(c.clicks)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-[12px] text-ink-soft">{c.top_code ? `/${c.top_code}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Link alerts" description="Caps, expiries, takedowns and password failures" />
              <ul className="grid gap-2 p-4">
                {alerts.length === 0 ? (
                  <li className="rounded-xl bg-emerald-50 px-3 py-3 text-[13px] text-emerald-700">All clear. No links need attention.</li>
                ) : (
                  alerts.map((a) => {
                    const Icon = ALERT_ICON[a.kind as keyof typeof ALERT_ICON] ?? AlertTriangle;
                    return (
                      <li key={`${a.kind}-${a.id}`}>
                        <Link href={`/dashboard/links/${a.id}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:border-pulse-200">
                          <Icon className={a.kind === "disabled" ? "size-4 text-red-600" : "size-4 text-amber-600"} aria-hidden />
                          <span className="font-mono text-[12.5px] text-ink">/{a.short_code}</span>
                          <span className="ml-auto truncate text-[12.5px] text-ink-soft">{a.detail}</span>
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
