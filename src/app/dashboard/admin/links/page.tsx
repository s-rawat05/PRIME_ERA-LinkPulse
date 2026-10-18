import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { requirePageAdmin } from "@/lib/auth/session";
import { users } from "@/db/schema";
import { Card, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { formatDate, formatNumber } from "@/lib/cn";
import { effectiveStatus, listLinks } from "@/lib/links/service";
import { LinkFilters } from "../../links/link-filters";
import { TakedownButton } from "../actions";

export const metadata: Metadata = { title: "All links" };

export default async function AdminLinks({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageAdmin();
  const sp = await searchParams;
  const db = await getDb();
  const rows = await listLinks(db, {}, { q: sp.q, status: sp.status, limit: 300 });
  const ownerIds = [...new Set(rows.map((r) => r.link.ownerId))];
  const owners = ownerIds.length ? await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ownerIds)) : [];
  const email = new Map(owners.map((o) => [o.id, o.email]));

  return (
    <>
      <PageHeader title="All links" description="Inspect any link on the platform and take abusive links down instantly." />
      <LinkFilters campaigns={[]} tags={[]} folders={[]} />
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead className="bg-canvas/60 text-[11.5px] text-ink-faint uppercase">
            <tr>
              <th className="px-5 py-3 font-medium">Link</th>
              <th className="px-3 py-3 font-medium">Destination</th>
              <th className="px-3 py-3 font-medium">Owner</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 text-right font-medium">Clicks</th>
              <th className="px-5 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-faint">No links match.</td></tr>
            )}
            {rows.map(({ link: l, humanClicks }) => (
              <tr key={l.id} className="border-t border-line align-top">
                <td className="px-5 py-3">
                  <Link href={`/dashboard/links/${l.id}`} className="font-semibold text-ink hover:text-pulse-700">/{l.shortCode}</Link>
                  <p className="text-[11.5px] text-ink-faint">{formatDate(l.createdAt)}</p>
                </td>
                <td className="max-w-[280px] px-3 py-3">
                  <p className="truncate text-ink-soft" title={l.destinationUrl}>{l.destinationUrl}</p>
                  {l.disabledReason && <p className="text-[11.5px] text-red-600">Reason: {l.disabledReason}</p>}
                </td>
                <td className="px-3 py-3 text-ink-soft">{email.get(l.ownerId) ?? "—"}</td>
                <td className="px-3 py-3"><StatusBadge status={effectiveStatus(l)} /></td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatNumber(humanClicks)}</td>
                <td className="px-5 py-3 text-right"><TakedownButton id={l.id} code={l.shortCode} disabled={l.status === "disabled"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
