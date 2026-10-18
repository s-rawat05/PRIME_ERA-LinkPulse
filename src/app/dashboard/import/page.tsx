import type { Metadata } from "next";
import { getDb } from "@/db";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/cn";
import { shortHost } from "@/lib/config";
import { listImportJobs } from "@/lib/csv/import";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Bulk import" };

const COLUMNS: [string, string][] = [
  ["destination_url", "Required. Absolute http(s) URL."],
  ["alias", "Optional custom alias (3–32 chars). Random code if empty."],
  ["title", "Optional label."],
  ["campaign", "Optional. Name of an existing campaign you own."],
  ["tags", "Optional. Names separated by ; (created if missing)."],
  ["expires_at", "Optional ISO date, e.g. 2026-12-31 or 2026-12-31T18:00:00Z."],
  ["max_clicks", "Optional positive whole number."],
  ["password", "Optional. Stored as a bcrypt hash."],
];

export default async function ImportPage() {
  const user = await requirePageUser();
  const jobs = await listImportJobs(await getDb(), user.id);
  return (
    <>
      <PageHeader title="Bulk import" description="Upload a CSV, review row-level validation, then import only the valid rows." />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Importer host={shortHost()} />
        <div className="grid h-fit gap-4">
          <Card>
            <CardHeader title="CSV schema" description="Header row required; column names are case-insensitive." />
            <dl className="grid gap-2 p-5 text-[12.5px]">
              {COLUMNS.map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono font-medium text-ink">{k}</dt>
                  <dd className="text-ink-faint">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Partial-import policy" />
            <ul className="grid gap-1.5 p-5 text-[12.5px] text-ink-soft">
              <li>• Each row is validated independently with the same rules as the link wizard.</li>
              <li>• Valid rows are imported; invalid rows are rejected with reasons and never create links.</li>
              <li>• Blank rows are skipped. Duplicate aliases within the file: the first occurrence wins.</li>
              <li>• Rows are re-validated at import time, so changes since the preview are caught.</li>
            </ul>
          </Card>
          <Card>
            <CardHeader title="Recent imports" />
            <ul className="divide-y divide-line px-5 pb-3 text-[12.5px]">
              {jobs.length === 0 && <li className="py-3 text-ink-faint">No imports yet.</li>}
              {jobs.map((j) => (
                <li key={j.id} className="py-2.5">
                  <p className="truncate font-medium text-ink">{j.filename}</p>
                  <p className="text-ink-faint">
                    {formatDate(j.createdAt, true)} · <span className="text-emerald-700">{j.importedRows} imported</span> · <span className="text-red-600">{j.rejectedRows} rejected</span> · {j.skippedRows} skipped
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
