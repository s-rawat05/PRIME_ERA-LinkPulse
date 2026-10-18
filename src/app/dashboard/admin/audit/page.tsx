import type { Metadata } from "next";
import { getDb } from "@/db";
import { requirePageAdmin } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui/primitives";
import { listAudit } from "@/lib/admin/service";
import { formatDate } from "@/lib/cn";

export const metadata: Metadata = { title: "Audit log" };

function summarize(v: unknown) {
  if (!v || typeof v !== "object") return "";
  return Object.entries(v as Record<string, unknown>)
    .map(([k, val]) => `${k}: ${val === null ? "∅" : typeof val === "object" ? JSON.stringify(val) : String(val)}`)
    .join(" · ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePageAdmin();
  const { q } = await searchParams;
  const rows = await listAudit(await getDb(), { q, limit: 200 });
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of sign-ins, link changes, takedowns, blocklist edits and imports. Secrets are redacted." />
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Filter by action (e.g. admin.link_disable) or target id" className="h-10 w-full max-w-md rounded-xl border border-line bg-white px-3.5 text-sm outline-none focus:border-pulse-400 focus:ring-4 focus:ring-pulse-100" aria-label="Filter audit log" />
        <button className="h-10 rounded-full bg-ink px-4 text-sm font-medium text-white">Filter</button>
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-[12.5px]">
          <thead className="bg-canvas/60 text-[11.5px] text-ink-faint uppercase">
            <tr>
              <th className="px-5 py-3 font-medium">Time (UTC)</th>
              <th className="px-3 py-3 font-medium">Actor</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 font-medium">Target</th>
              <th className="px-5 py-3 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-ink-faint">No audit entries.</td></tr>}
            {rows.map(({ a, actorEmail }) => (
              <tr key={a.id} className="border-t border-line align-top">
                <td className="px-5 py-2.5 whitespace-nowrap text-ink-soft">{formatDate(a.createdAt, true)}</td>
                <td className="px-3 py-2.5 text-ink-soft">{actorEmail ?? "system"}</td>
                <td className="px-3 py-2.5 font-mono text-ink">{a.action}</td>
                <td className="px-3 py-2.5 font-mono text-[11.5px] text-ink-faint">{a.targetType}:{a.targetId?.slice(0, 12)}</td>
                <td className="max-w-[420px] px-5 py-2.5 text-ink-soft">
                  {a.before ? <p className="truncate" title={summarize(a.before)}><span className="text-ink-faint">before</span> {summarize(a.before)}</p> : null}
                  {a.after ? <p className="truncate" title={summarize(a.after)}><span className="text-ink-faint">after</span> {summarize(a.after)}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
