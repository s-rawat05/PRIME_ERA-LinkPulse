import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, ExternalLink, FlaskConical, Gauge, Lock, Megaphone, ShieldAlert, ShieldCheck, Tag } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { linkTags, redirectRules, tags as tagsTable } from "@/db/schema";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { LiveRefresh, RangePicker } from "@/components/dashboard/controls";
import { Badge, ButtonLink, Card, StatusBadge } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/interactive";
import { parseRange } from "@/lib/analytics/queries";
import { requirePageUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/cn";
import { shortUrl } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { effectiveStatus, getLinkForUser } from "@/lib/links/service";
import { campaignOptions, listFolders, listTags } from "@/lib/org/service";
import { getQrStyle } from "@/lib/qr";
import { EditLinkForm, QrStudio, RulesEditor, StatusActions } from "./parts";

export const metadata: Metadata = { title: "Link details" };

export default async function LinkDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const link = await getLinkForUser(db, user, id, { allowAdmin: true }).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const owner = link.ownerId === user.id;
  const [rules, linkTagRows, campaigns, folders, tags, qr] = await Promise.all([
    db.select().from(redirectRules).where(eq(redirectRules.linkId, link.id)).orderBy(asc(redirectRules.priority)),
    db.select({ id: tagsTable.id, name: tagsTable.name, color: tagsTable.color }).from(linkTags).innerJoin(tagsTable, eq(tagsTable.id, linkTags.tagId)).where(eq(linkTags.linkId, link.id)),
    campaignOptions(db, link.ownerId),
    listFolders(db, link.ownerId),
    listTags(db, link.ownerId),
    getQrStyle(db, link.id),
  ]);
  const status = effectiveStatus(link);
  const url = shortUrl(link.shortCode);
  const range = parseRange({ range: sp.range ?? "30d" });
  const campaign = campaigns.find((c) => c.id === link.campaignId);
  const capPct = link.maxClicks ? Math.min(100, Math.round((link.clickCount / link.maxClicks) * 100)) : 0;

  return (
    <>
      <Link href="/dashboard/links" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink"><ArrowLeft className="size-4" /> All links</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[26px] font-semibold tracking-tight text-ink">/{link.shortCode}</h1>
            <StatusBadge status={status} />
            {link.isSynthetic && <Badge tone="demo">demo data</Badge>}
            {!owner && <Badge tone="admin">viewing as admin</Badge>}
          </div>
          <p className="mt-1 truncate text-sm text-ink-soft">{link.title ?? "Untitled link"} · → <a href={link.destinationUrl} target="_blank" rel="noopener noreferrer" className="hover:text-pulse-700">{link.destinationUrl}</a></p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-full bg-white px-3 py-1.5 text-[13px] text-pulse-700 ring-1 ring-line">{url}</code>
            <CopyButton value={url} />
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[13px] font-medium text-ink-soft hover:text-pulse-700"><ExternalLink className="size-3.5" /> Open</a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/dashboard/simulator?link=${link.id}`} variant="secondary"><FlaskConical className="size-4" /> Simulate</ButtonLink>
          <StatusActions id={link.id} status={link.status} owner={owner} />
        </div>
      </div>

      {link.status === "disabled" && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800" role="status">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <p><b>Disabled by an administrator</b> on {formatDate(link.disabledAt, true)} UTC. Reason: {link.disabledReason}. Redirects are blocked; analytics remain available.</p>
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-[12.5px] text-ink-faint"><Gauge className="size-4" /> Click cap</p>
          {link.maxClicks ? (
            <>
              <p className="mt-2 text-lg font-semibold text-ink">{link.clickCount} / {link.maxClicks}</p>
              <div className="mt-2 h-2 rounded-full bg-canvas"><div className={capPct >= 100 ? "h-2 rounded-full bg-orange-500" : "h-2 rounded-full bg-pulse-600"} style={{ width: `${capPct}%` }} /></div>
            </>
          ) : (
            <p className="mt-2 text-lg font-semibold text-ink">Unlimited <span className="text-[13px] font-normal text-ink-faint">· {link.clickCount} counted</span></p>
          )}
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-[12.5px] text-ink-faint"><CalendarClock className="size-4" /> Expiry</p>
          <p className="mt-2 text-lg font-semibold text-ink">{link.expiresAt ? `${formatDate(link.expiresAt, true)}` : "Never"}</p>
          {link.expiredUrl && <p className="truncate text-[12px] text-ink-faint">Fallback: {link.expiredUrl}</p>}
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-[12.5px] text-ink-faint"><Lock className="size-4" /> Access</p>
          <p className="mt-2 text-lg font-semibold text-ink">{link.passwordHash ? "Password protected" : "Public"}</p>
          <p className="flex items-center gap-1 text-[12px] text-ink-faint">
            <ShieldCheck className="size-3.5" />
            {link.safetyStatus === "safe" ? "Safe Browsing: no threats" : link.safetyStatus === "flagged" ? "Flagged by Safe Browsing" : "Blocklist checked · external scan not enabled"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-[12.5px] text-ink-faint"><Megaphone className="size-4" /> Campaign & tags</p>
          <p className="mt-2 truncate text-lg font-semibold text-ink">{campaign ? <Link href={`/dashboard/campaigns/${campaign.id}`} className="hover:text-pulse-700">{campaign.name}</Link> : "—"}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {linkTagRows.length ? linkTagRows.map((t) => <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: t.color }}>{t.name}</span>) : <span className="flex items-center gap-1 text-[12px] text-ink-faint"><Tag className="size-3" /> No tags</span>}
          </div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Analytics</h2>
        <div className="flex flex-wrap gap-2"><LiveRefresh /><RangePicker current={range.key} /></div>
      </div>
      <AnalyticsPanel scope={{ linkId: link.id, includeSynthetic: sp.real !== "1" }} range={range} showTopLinks={false} />

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <QrStudio id={link.id} code={link.shortCode} fg={qr.fg} bg={qr.bg} owner={owner} />
        <RulesEditor id={link.id} owner={owner} rules={rules.map((r) => ({ id: r.id, priority: r.priority, conditionType: r.conditionType, conditionValue: r.conditionValue, targetUrl: r.targetUrl }))} />
      </div>
      {owner && (
        <div className="mt-4">
          <EditLinkForm
            id={link.id}
            campaigns={campaigns}
            folders={folders.map((f) => ({ id: f.id, name: f.name }))}
            tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
            init={{
              destinationUrl: link.destinationUrl,
              title: link.title ?? "",
              campaignId: link.campaignId ?? "",
              folderId: link.folderId ?? "",
              tagIds: linkTagRows.map((t) => t.id),
              expiresAt: link.expiresAt?.toISOString() ?? "",
              expiredUrl: link.expiredUrl ?? "",
              maxClicks: link.maxClicks?.toString() ?? "",
              hasPassword: !!link.passwordHash,
            }}
          />
        </div>
      )}
      <p className="mt-4 text-[12px] text-ink-faint">Created {formatDate(link.createdAt, true)} UTC · Last updated {formatDate(link.updatedAt, true)} UTC</p>
    </>
  );
}
