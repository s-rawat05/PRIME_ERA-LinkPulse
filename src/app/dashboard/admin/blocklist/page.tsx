import type { Metadata } from "next";
import { getDb } from "@/db";
import { requirePageAdmin } from "@/lib/auth/session";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { listBlockedDomains } from "@/lib/admin/service";
import { formatDate } from "@/lib/cn";
import { BlocklistForm, UnblockButton } from "../actions";

export const metadata: Metadata = { title: "Domain blocklist" };

export default async function Blocklist() {
  await requirePageAdmin();
  const rows = await listBlockedDomains(await getDb());
  return (
    <>
      <PageHeader title="Domain blocklist" description="Blocked domains (and their subdomains) cannot be shortened, and existing links to them stop redirecting immediately." />
      <Card className="mb-4">
        <CardHeader title="Block a domain" />
        <BlocklistForm />
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="bg-canvas/60 text-[11.5px] text-ink-faint uppercase">
            <tr>
              <th className="px-5 py-3 font-medium">Domain</th>
              <th className="px-3 py-3 font-medium">Reason</th>
              <th className="px-3 py-3 text-right font-medium">Affected links</th>
              <th className="px-3 py-3 font-medium">Added</th>
              <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-ink-faint">The blocklist is empty.</td></tr>}
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td className="px-5 py-3 font-mono text-ink">{d.domain}</td>
                <td className="px-3 py-3 text-ink-soft">{d.reason ?? "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums">{d.linkCount}</td>
                <td className="px-3 py-3 text-ink-soft">{formatDate(d.createdAt)}{d.addedByEmail ? ` · ${d.addedByEmail}` : ""}</td>
                <td className="px-5 py-3 text-right"><UnblockButton id={d.id} domain={d.domain} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
