import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Lock, Plus, QrCode } from "lucide-react";
import { getDb } from "@/db";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/interactive";
import { requirePageUser } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/cn";
import { shortUrl, shortHost } from "@/lib/config";
import { effectiveStatus, listLinks } from "@/lib/links/service";
import { campaignOptions, listFolders, listTags } from "@/lib/org/service";
import { LinkFilters } from "./link-filters";

export const metadata: Metadata = { title: "Links" };

export default async function LinksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const db = await getDb();
  const [rows, campaigns, tags, folders] = await Promise.all([
    listLinks(db, { ownerId: user.id }, { q: sp.q, status: sp.status, campaignId: sp.campaign, tagId: sp.tag, folderId: sp.folder }),
    campaignOptions(db, user.id),
    listTags(db, user.id),
    listFolders(db, user.id),
  ]);
  const filtered = !!(sp.q || sp.status || sp.campaign || sp.tag || sp.folder);
  const host = shortHost();

  return (
    <>
      <PageHeader
        title="Links"
        description="Every short link you own, with status, rules and human click counts."
        actions={<ButtonLink href="/dashboard/links/new" variant="blue"><Plus className="size-4" /> Create link</ButtonLink>}
      />
      <LinkFilters campaigns={campaigns} tags={tags.map((t) => ({ id: t.id, name: t.name }))} folders={folders.map((f) => ({ id: f.id, name: f.name }))} />
      <Card className="mt-4 overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Link2 className="size-6" />}
            title={filtered ? "No links match these filters" : "No links yet"}
            description={filtered ? "Try clearing a filter or searching for something else." : "Create a short link to start tracking clicks."}
            action={!filtered ? <ButtonLink href="/dashboard/links/new" variant="blue"><Plus className="size-4" /> Create link</ButtonLink> : <ButtonLink href="/dashboard/links" variant="secondary">Clear filters</ButtonLink>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13.5px]">
              <thead className="bg-canvas/60 text-[11.5px] text-ink-faint uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Short link</th>
                  <th className="px-3 py-3 font-medium">Destination</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Campaign / tags</th>
                  <th className="px-3 py-3 text-right font-medium">Clicks</th>
                  <th className="px-3 py-3 font-medium">Created</th>
                  <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ link: l, campaignName, humanClicks, tags: lt }) => {
                  const status = effectiveStatus(l);
                  return (
                    <tr key={l.id} className="border-t border-line align-top hover:bg-pulse-50/30">
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/links/${l.id}`} className="font-semibold text-ink hover:text-pulse-700">
                          <span className="text-ink-faint">{host}/</span>{l.shortCode}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {l.title && <span className="max-w-[220px] truncate text-[12px] text-ink-faint">{l.title}</span>}
                          {l.passwordHash && <Badge tone="info"><Lock className="size-3" /> password</Badge>}
                          {l.isSynthetic && <Badge tone="demo">demo</Badge>}
                        </div>
                      </td>
                      <td className="max-w-[280px] px-3 py-3.5">
                        <a href={l.destinationUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-ink-soft hover:text-pulse-700" title={l.destinationUrl}>
                          {l.destinationUrl}
                        </a>
                        {(l.expiresAt || l.maxClicks) && (
                          <p className="mt-1 text-[12px] text-ink-faint">
                            {l.expiresAt && `Expires ${formatDate(l.expiresAt)}`}
                            {l.expiresAt && l.maxClicks ? " · " : ""}
                            {l.maxClicks && `${l.clickCount}/${l.maxClicks} cap`}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3.5"><StatusBadge status={status} /></td>
                      <td className="px-3 py-3.5">
                        {campaignName && <p className="text-[12.5px] font-medium text-ink">{campaignName}</p>}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {lt.map((t) => (
                            <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: t.color }}>{t.name}</span>
                          ))}
                          {!campaignName && !lt.length && <span className="text-ink-faint">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right font-semibold tabular-nums">{formatNumber(humanClicks)}</td>
                      <td className="px-3 py-3.5 whitespace-nowrap text-ink-soft">{formatDate(l.createdAt)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <CopyButton value={shortUrl(l.shortCode)} compact label="Copy" />
                          <Link href={`/dashboard/links/${l.id}#qr`} className="grid size-8 place-items-center rounded-full border border-line bg-white text-ink-soft hover:text-pulse-700" aria-label={`QR code for ${l.shortCode}`}>
                            <QrCode className="size-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-[12px] text-ink-faint">Showing {rows.length} link{rows.length === 1 ? "" : "s"}. Click counts include human redirects only; bots are excluded.</p>
    </>
  );
}
