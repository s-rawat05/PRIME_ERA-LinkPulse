
import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, QrCode, Trophy, Users, MousePointerClick, ArrowUpRight } from "lucide-react";
import { getDb } from "@/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/cn";
import { listCampaigns } from "@/lib/org/service";
import { CampaignDialog } from "./campaign-form";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const user = await requirePageUser();
  const campaigns = await listCampaigns(await getDb(), user.id);

  const maxClicks = Math.max(1, ...campaigns.map((c) => c.clicks));
  const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);
  const totalLinks = campaigns.reduce((sum, c) => sum + c.link_count, 0);
  const totalUniques = campaigns.reduce((sum, c) => sum + c.uniques, 0);

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <PageHeader
        title="Campaigns"
        description="Organize your links, track campaign performance, and discover your top performers."
        actions={<CampaignDialog />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-ink-soft">Total campaigns</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                {formatNumber(campaigns.length)}
              </p>
            </div>
            <div className="rounded-xl bg-pulse-50 p-3 text-pulse-700">
              <Megaphone className="size-5" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-ink-soft">Total human clicks</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                {formatNumber(totalClicks)}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
              <MousePointerClick className="size-5" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-ink-soft">Links in campaigns</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                {formatNumber(totalLinks)}
              </p>
            </div>
            <div className="rounded-xl bg-violet-50 p-3 text-violet-700">
              <QrCode className="size-5" />
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              Your campaigns
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Select a campaign to explore its performance and associated links.
            </p>
          </div>
          <p className="text-sm text-ink-faint">
            {formatNumber(campaigns.length)}{" "}
            {campaigns.length === 1 ? "campaign" : "campaigns"}
          </p>
        </div>

        {campaigns.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Megaphone className="size-6" />}
              title="No campaigns yet"
              description="Create your first campaign to group links and track their performance in one place."
              action={<CampaignDialog />}
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/campaigns/${c.id}`}
                className="group flex min-w-0 flex-col rounded-[var(--radius-xl2)] border border-line bg-white p-5 shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-1 hover:border-pulse-300 hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pulse-500"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="shrink-0 rounded-xl bg-pulse-50 p-2.5 text-pulse-700 transition group-hover:bg-pulse-100">
                      <Megaphone className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-ink transition group-hover:text-pulse-700">
                        {c.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink-faint">
                        {c.description ??
                          (c.starts_at
                            ? `${formatDate(c.starts_at)} – ${formatDate(c.ends_at)}`
                            : "No description available")}
                      </p>
                    </div>
                  </div>

                  <ArrowUpRight className="size-4 shrink-0 text-ink-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-pulse-700" />
                </div>

                {c.is_synthetic && (
                  <div className="mt-3">
                    <Badge tone="demo">Demo data</Badge>
                  </div>
                )}

                <div className="mt-6">
                  <p className="text-3xl font-semibold tracking-tight text-ink">
                    {formatNumber(c.clicks)}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    Human clicks
                  </p>

                  <div
                    className="mt-4 h-2 overflow-hidden rounded-full bg-canvas"
                    role="progressbar"
                    aria-label={`${c.name} clicks relative to the top campaign`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((c.clicks / maxClicks) * 100)}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-pulse-400 to-pulse-700 transition-all duration-500"
                      style={{
                        width: `${(c.clicks / maxClicks) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4">
                  <div className="min-w-0">
                    <Users className="mb-2 size-4 text-ink-faint" />
                    <p className="truncate text-sm font-semibold text-ink">
                      {formatNumber(c.uniques)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">Visitors</p>
                  </div>

                  <div className="min-w-0">
                    <QrCode className="mb-2 size-4 text-ink-faint" />
                    <p className="truncate text-sm font-semibold text-ink">
                      {formatNumber(c.qr_clicks)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">QR clicks</p>
                  </div>

                  <div className="min-w-0">
                    <Trophy className="mb-2 size-4 text-amber-500" />
                    <p className="truncate text-sm font-semibold text-ink">
                      {c.top_code ? `/${c.top_code}` : "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">Top link</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
