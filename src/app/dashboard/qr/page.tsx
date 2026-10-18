import type { Metadata } from "next";
import Link from "next/link";
import { Download, QrCode } from "lucide-react";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ButtonLink, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/cn";
import { shortHost } from "@/lib/config";
import { effectiveStatus, listLinks } from "@/lib/links/service";

export const metadata: Metadata = { title: "QR codes" };

export default async function QrPage() {
  const user = await requirePageUser();
  const db = await getDb();
  const links = await listLinks(db, { ownerId: user.id }, { limit: 60 });
  const scans = await db.execute<{ link_id: string; scans: number; total: number }>(sql`
    SELECT ce.link_id,
      count(*) FILTER (WHERE ce.source = 'qr')::int AS scans,
      count(*)::int AS total
    FROM click_events ce JOIN links l ON l.id = ce.link_id
    WHERE l.owner_id = ${user.id} AND ce.outcome = 'redirected'
    GROUP BY ce.link_id`);
  const byLink = new Map(scans.rows.map((r) => [r.link_id, r]));
  const totalScans = scans.rows.reduce((n, r) => n + Number(r.scans), 0);
  const host = shortHost();

  return (
    <>
      <PageHeader title="QR codes" description={`Every link has a QR code that encodes ?s=qr, so scans are counted separately. ${formatNumber(totalScans)} human QR scans so far.`} />
      {links.length === 0 ? (
        <Card><EmptyState icon={<QrCode className="size-6" />} title="No QR codes yet" description="Create a link and its QR code is generated automatically." action={<ButtonLink href="/dashboard/links/new" variant="blue">Create link</ButtonLink>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {links.map(({ link: l }) => {
            const s = byLink.get(l.id);
            return (
              <Card key={l.id} className="p-4">
                <Link href={`/dashboard/links/${l.id}#qr`} className="block rounded-2xl bg-canvas p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/links/${l.id}/qr?format=png&size=320`} alt={`QR code for ${host}/${l.shortCode}`} loading="lazy" className="mx-auto aspect-square w-full max-w-[180px] rounded-xl bg-white" />
                </Link>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Link href={`/dashboard/links/${l.id}`} className="truncate font-semibold text-ink hover:text-pulse-700">/{l.shortCode}</Link>
                  <StatusBadge status={effectiveStatus(l)} />
                </div>
                <p className="text-[12px] text-ink-faint">{formatNumber(Number(s?.scans ?? 0))} scans · {formatNumber(Number(s?.total ?? 0))} total clicks</p>
                <div className="mt-3 flex gap-1.5">
                  <a href={`/api/links/${l.id}/qr?format=png&download=1`} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full border border-line text-[12px] font-medium text-ink-soft hover:text-pulse-700"><Download className="size-3.5" /> PNG</a>
                  <a href={`/api/links/${l.id}/qr?format=svg&download=1`} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full border border-line text-[12px] font-medium text-ink-soft hover:text-pulse-700"><Download className="size-3.5" /> SVG</a>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
