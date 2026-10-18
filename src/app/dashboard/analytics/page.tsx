import type { Metadata } from "next";
import { getDb } from "@/db";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { LiveRefresh, RangePicker } from "@/components/dashboard/controls";
import { PageHeader } from "@/components/ui/primitives";
import { parseRange } from "@/lib/analytics/queries";
import { requirePageUser } from "@/lib/auth/session";
import { campaignOptions } from "@/lib/org/service";
import { AnalyticsFilters } from "./filters";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const range = parseRange({ range: sp.range, from: sp.from, to: sp.to });
  const campaigns = await campaignOptions(await getDb(), user.id);
  const campaignId = campaigns.some((c) => c.id === sp.campaign) ? sp.campaign : undefined;

  return (
    <>
      <PageHeader title="Analytics" description="Clicks, visitors, sources and redirect speed for all of your links." actions={<LiveRefresh />} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AnalyticsFilters campaigns={campaigns} campaignId={campaignId ?? ""} from={sp.from ?? ""} to={sp.to ?? ""} />
        <RangePicker current={range.key} />
      </div>
      <AnalyticsPanel scope={{ ownerId: user.id, campaignId, includeSynthetic: sp.real !== "1" }} range={range} />
    </>
  );
}
