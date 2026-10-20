import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, QrCode, Trophy, Users } from "lucide-react";
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
  return (
    <>
      <PageHeader title="Campaigns" description="Group links, compare performance and find your top performers." actions={<CampaignDialog />} />
      {campaigns.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone className="size-6" />} title="No campaigns yet" description="Create a campaign such as “Diwali Sale”, then attach links to it from the link wizard." action={<CampaignDialog />} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/dashboard/campaigns/${c.id}`} className="group rounded-[var(--radius-xl2)] border border-line bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-semibold text-ink group-hover:text-pulse-700">{c.name}</h2>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-faint">{c.description ?? (c.starts_at ? `${formatDate(c.starts_at)} – ${formatDate(c.ends_at)}` : "No description")}</p>
                </div>
                {c.is_synthetic && <Badge tone="demo">demo</Badge>}
              </div>
              <p className="mt-5 text-[30px] leading-none font-semibold tracking-tight text-ink">{formatNumber(c.clicks)}</p>
              <p className="text-[12px] text-ink-faint">human clicks · {c.link_count} link{c.link_count === 1 ? "" : "s"}</p>
              <div className="mt-3 h-1.5 rounded-full bg-canvas"><div className="h-1.5 rounded-full bg-gradient-to-r from-pulse-400 to-pulse-700" style={{ width: `${(c.clicks / maxClicks) * 100}%` }} /></div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-[12px] text-ink-soft">
                <span className="flex items-center gap-1"><Users className="size-3.5" /> {formatNumber(c.uniques)}</span>
                <span className="flex items-center gap-1"><QrCode className="size-3.5" /> {formatNumber(c.qr_clicks)}</span>
                <span className="flex items-center gap-1 truncate"><Trophy className="size-3.5 text-amber-500" /> {c.top_code ? `/${c.top_code}` : "—"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
