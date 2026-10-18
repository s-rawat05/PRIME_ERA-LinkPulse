import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Link2, Plus } from "lucide-react";
import { getDb } from "@/db";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { LiveRefresh, RangePicker } from "@/components/dashboard/controls";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { parseRange } from "@/lib/analytics/queries";
import { requirePageUser } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/cn";
import { AppError } from "@/lib/errors";
import { effectiveStatus, listLinks } from "@/lib/links/service";
import { getCampaign } from "@/lib/org/service";
import { CampaignDialog, DeleteCampaign } from "../campaign-form";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const c = await getCampaign(db, user, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const owner = c.ownerId === user.id;
  const links = await listLinks(db, { ownerId: c.ownerId }, { campaignId: c.id });
  const range = parseRange({ range: sp.range ?? "30d" });
  const utm = [c.utmSource && `utm_source=${c.utmSource}`, c.utmMedium && `utm_medium=${c.utmMedium}`, c.utmCampaign && `utm_campaign=${c.utmCampaign}`].filter(Boolean).join("&");

  return (
    <>
      <Link href="/dashboard/campaigns" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink"><ArrowLeft className="size-4" /> Campaigns</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-semibold tracking-tight text-ink">{c.name}</h1>
            {c.isSynthetic && <Badge tone="demo">demo data</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-soft">{c.description ?? "No description"}{c.startsAt ? ` · ${formatDate(c.startsAt)} – ${formatDate(c.endsAt)}` : ""}</p>
          {utm && <code className="mt-2 inline-block rounded-full bg-white px-3 py-1 text-[12px] text-ink-soft ring-1 ring-line">{utm}</code>}
        </div>
        {owner && (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/dashboard/links/new?campaign=${c.id}`} variant="blue"><Plus className="size-4" /> Add link</ButtonLink>
            <CampaignDialog trigger="edit" campaign={{ id: c.id, name: c.name, description: c.description, utmSource: c.utmSource, utmMedium: c.utmMedium, utmCampaign: c.utmCampaign, startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null }} />
            <DeleteCampaign id={c.id} name={c.name} />
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2"><LiveRefresh /><RangePicker current={range.key} /></div>
      <AnalyticsPanel scope={{ campaignId: c.id, ownerId: c.ownerId, includeSynthetic: sp.real !== "1" }} range={range} showRecent={false} />

      <Card className="mt-4">
        <CardHeader title="Links in this campaign" description={`${links.length} link${links.length === 1 ? "" : "s"}, ranked by all-time human clicks`} />
        {links.length === 0 ? (
          <EmptyState icon={<Link2 className="size-6" />} title="No links yet" description="Add a link to start measuring this campaign." action={owner ? <ButtonLink href={`/dashboard/links/new?campaign=${c.id}`} variant="blue" size="sm">Add link</ButtonLink> : undefined} />
        ) : (
          <ul className="divide-y divide-line p-2">
            {[...links].sort((a, b) => b.humanClicks - a.humanClicks).map(({ link: l, humanClicks }, i) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-3">
                <span className="grid size-7 place-items-center rounded-full bg-canvas font-mono text-[11px] text-ink-soft">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/links/${l.id}`} className="font-semibold text-ink hover:text-pulse-700">/{l.shortCode}</Link>
                  <p className="truncate text-[12px] text-ink-faint">{l.destinationUrl}</p>
                </div>
                <StatusBadge status={effectiveStatus(l)} />
                <span className="w-16 text-right font-semibold tabular-nums">{formatNumber(humanClicks)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
