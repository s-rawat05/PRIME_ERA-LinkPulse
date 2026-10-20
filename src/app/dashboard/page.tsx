
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Gauge,
  KeyRound,
  Link2,
  Megaphone,
  MousePointerClick,
  Plus,
  ShieldOff,
  TrendingUp,
} from "lucide-react";

import { getDb } from "@/db";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { LiveRefresh, RangePicker } from "@/components/dashboard/controls";
import {
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import {
  countLinks,
  getLinkAlerts,
  parseRange,
} from "@/lib/analytics/queries";
import { requirePageUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/cn";
import { listCampaigns } from "@/lib/org/service";

export const metadata: Metadata = { title: "Overview" };

const ALERT_ICON = {
  near_cap: Gauge,
  expiring: CalendarClock,
  disabled: ShieldOff,
  password_failures: KeyRound,
} as const;

export default async function Overview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const range = parseRange({ range: sp.range ?? "7d" });
  const db = await getDb();

  const [counts, alerts, campaigns] = await Promise.all([
    countLinks(db, user.id),
    getLinkAlerts(db, user.id),
    listCampaigns(db, user.id),
  ]);

  const stats = [
    {
      label: "Total links",
      value: counts.total,
      icon: Link2,
      href: "/dashboard/links",
      description: "All your short links",
      iconStyle: "bg-blue-50 text-blue-700",
    },
    {
      label: "Active links",
      value: counts.active,
      icon: CheckCircle2,
      href: "/dashboard/links?status=active",
      description: "Ready to redirect",
      iconStyle: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Paused links",
      value: counts.paused,
      icon: Gauge,
      href: "/dashboard/links?status=paused",
      description: "Temporarily paused",
      iconStyle: "bg-amber-50 text-amber-700",
    },
    {
      label: "Expired links",
      value: counts.expired,
      icon: CalendarClock,
      href: "/dashboard/links?status=expired",
      description: "Past their expiry date",
      iconStyle: "bg-rose-50 text-rose-700",
    },
    {
      label: "Disabled links",
      value: counts.disabled,
      icon: ShieldOff,
      href: "/dashboard/links?status=disabled",
      description: "Currently disabled",
      iconStyle: "bg-slate-100 text-slate-700",
    },
  ];

  return (
    <div className="space-y-6">
      {sp.denied === "admin" && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          This area is restricted to administrators.
        </p>
      )}

      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description="Your LinkPulse workspace at a glance. Track link performance and keep everything running smoothly."
        actions={
          <>
            <LiveRefresh />
            <ButtonLink href="/dashboard/links/new" variant="blue">
              <Plus className="size-4" />
              Create link
            </ButtonLink>
          </>
        }
      />

      {counts.total === 0 ? (
        <Card>
          <EmptyState
            icon={<Link2 className="size-6" />}
            title="Create your first short link"
            description="Turn a long URL into a shareable short link. Once people start clicking, your analytics will appear here."
            action={
              <ButtonLink href="/dashboard/links/new" variant="blue">
                <Plus className="size-4" />
                Create your first link
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-ink">
                  Your links
                </h2>
                <p className="mt-1 text-sm text-ink-faint">
                  A quick overview of your link status.
                </p>
              </div>
              <Link
                href="/dashboard/links"
                className="inline-flex items-center gap-1 text-sm font-medium text-pulse-700 hover:text-pulse-800"
              >
                Manage links
                <ArrowRight className="size-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {stats.map((stat) => {
                const Icon = stat.icon;

                return (
                  <Link
                    key={stat.label}
                    href={stat.href}
                    className="group rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:border-pulse-200 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-ink-soft">
                        {stat.label}
                      </span>
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-xl ${stat.iconStyle}`}
                      >
                        <Icon className="size-4" aria-hidden />
                      </span>
                    </div>

                    <p className="mt-4 text-3xl font-semibold tracking-tight text-ink">
                      {formatNumber(stat.value)}
                    </p>

                    <p className="mt-1 text-xs text-ink-faint">
                      {stat.description}
                    </p>

                    <div className="mt-3 flex items-center gap-1 text-xs font-medium text-pulse-700 opacity-80 group-hover:opacity-100">
                      View links
                      <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-ink">
                Performance analytics
              </h2>
              <p className="mt-1 text-sm text-ink-faint">
                Explore clicks and traffic trends over time.
              </p>
            </div>

            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-pulse-50 text-pulse-700">
                    <TrendingUp className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Link activity
                    </p>
                    <p className="text-xs text-ink-faint">
                      Human clicks and traffic insights
                    </p>
                  </div>
                </div>

                <RangePicker current={range.key} />
              </div>

              <AnalyticsPanel
                scope={{
                  ownerId: user.id,
                  includeSynthetic: sp.real !== "1",
                }}
                range={range}
              />
            </Card>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader
                title="Campaign performance"
                description="All-time human clicks"
                action={
                  <Link
                    href="/dashboard/campaigns"
                    className="inline-flex items-center gap-1 text-sm font-medium text-pulse-700 hover:text-pulse-800"
                  >
                    View all
                    <ArrowRight className="size-3.5" />
                  </Link>
                }
              />

              {campaigns.length === 0 ? (
                <div className="p-3">
                  <EmptyState
                    icon={<Megaphone className="size-6" />}
                    title="No campaigns yet"
                    description="Group related links into campaigns to compare their performance."
                    action={
                      <ButtonLink
                        href="/dashboard/campaigns"
                        variant="secondary"
                        size="sm"
                      >
                        Explore campaigns
                      </ButtonLink>
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-[13px]">
                    <thead className="bg-canvas/60 text-[11px] uppercase text-ink-faint">
                      <tr>
                        <th className="px-4 py-3 font-medium">Campaign</th>
                        <th className="px-3 py-3 text-right font-medium">
                          Links
                        </th>
                        <th className="px-3 py-3 text-right font-medium">
                          Clicks
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Top link
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.slice(0, 6).map((campaign) => (
                        <tr
                          key={campaign.id}
                          className="border-t border-line transition hover:bg-canvas/50"
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/dashboard/campaigns/${campaign.id}`}
                              className="font-medium text-ink hover:text-pulse-700"
                            >
                              {campaign.name}
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                            {formatNumber(campaign.link_count)}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">
                            {formatNumber(campaign.clicks)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-ink-soft">
                            {campaign.top_code
                              ? `/${campaign.top_code}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader
                title="Link alerts"
                description="Links that may need your attention"
                action={
                  <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink-soft">
                    {alerts.length} {alerts.length === 1 ? "alert" : "alerts"}
                  </span>
                }
              />

              {alerts.length === 0 ? (
                <div className="m-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      Everything looks good
                    </p>
                    <p className="mt-1 text-xs leading-5 text-emerald-700">
                      No links currently need your attention.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2 p-4">
                  {alerts.map((alert) => {
                    const Icon =
                      ALERT_ICON[
                        alert.kind as keyof typeof ALERT_ICON
                      ] ?? AlertTriangle;

                    const isDisabled = alert.kind === "disabled";

                    return (
                      <li key={`${alert.kind}-${alert.id}`}>
                        <Link
                          href={`/dashboard/links/${alert.id}`}
                          className="group flex items-start gap-3 rounded-xl border border-line p-3 transition hover:border-pulse-200 hover:bg-canvas/40"
                        >
                          <span
                            className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                              isDisabled
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            <Icon className="size-4" aria-hidden />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-sm font-medium text-ink">
                              /{alert.short_code}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-ink-soft">
                              {alert.detail}
                            </span>
                          </span>

                          <ArrowRight className="mt-1 size-4 shrink-0 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-pulse-700" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-pulse-50 text-pulse-700">
                <MousePointerClick className="size-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Ready to share another link?
                </h3>
                <p className="mt-1 text-xs text-ink-faint">
                  Create a short link and start tracking its performance.
                </p>
              </div>
            </div>

            <ButtonLink href="/dashboard/links/new" variant="blue">
              <Plus className="size-4" />
              Create link
            </ButtonLink>
          </Card>
        </>
      )}
    </div>
  );
}
