
import type { Metadata } from "next";
import { getDb } from "@/db";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { LiveRefresh, RangePicker } from "@/components/dashboard/controls";
import { PageHeader } from "@/components/ui/primitives";
import { parseRange } from "@/lib/analytics/queries";
import { requirePageUser } from "@/lib/auth/session";
import { campaignOptions } from "@/lib/org/service";
import { AnalyticsFilters } from "./filters";

export const metadata: Metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePageUser();
  const sp = await searchParams;

  const range = parseRange({
    range: sp.range,
    from: sp.from,
    to: sp.to,
  });

  const campaigns = await campaignOptions(await getDb(), user.id);

  const campaignId = campaigns.some((c) => c.id === sp.campaign)
    ? sp.campaign
    : undefined;

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <PageHeader
          title="Analytics"
          description="Track clicks, visitors, traffic sources, and redirect performance across your links."
          actions={<LiveRefresh />}
        />
      </div>

      <section
        aria-label="Analytics filters"
        className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-sm font-semibold text-slate-900">
              Filter your analytics
            </p>
            <p className="text-sm text-slate-500">
              Choose a campaign and date range to explore your link performance.
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <AnalyticsFilters
              campaigns={campaigns}
              campaignId={campaignId ?? ""}
              from={sp.from ?? ""}
              to={sp.to ?? ""}
            />

            <RangePicker current={range.key} />
          </div>
        </div>
      </section>

      <section
        aria-label="Link analytics results"
        className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      >
        <AnalyticsPanel
          scope={{
            ownerId: user.id,
            campaignId,
            includeSynthetic: sp.real !== "1",
          }}
          range={range}
        />
      </section>
    </main>
  );
}
