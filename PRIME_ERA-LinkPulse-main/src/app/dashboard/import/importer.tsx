"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card, CardHeader, StatusBadge } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/client";
import { cn } from "@/lib/cn";

type Row = { row: number; status: "valid" | "imported" | "rejected" | "skipped"; errors: string[]; warnings: string[]; data: Record<string, string>; shortCode?: string };
type Report = { jobId?: string; filename: string; total: number; valid: number; imported: number; rejected: number; skipped: number; rows: Row[]; unknownColumns?: string[] };

async function upload(url: string, file: File): Promise<Report> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(url, { method: "POST", body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? "Upload failed");
  return body as Report;
}

export function Importer({ host }: { host: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<Report | null>(null);
  const [result, setResult] = useState<Report | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [filter, setFilter] = useState<"all" | "problems">("all");

  async function choose(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    if (!f) return;
    setBusy("preview");
    try {
      setPreview(await upload("/api/import/preview", f));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not read the file");
      setFile(null);
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    if (!file) return;
    setBusy("import");
    try {
      const r = await upload("/api/import", file);
      setResult(r);
      setPreview(null);
      toast.success(`Imported ${r.imported} link${r.imported === 1 ? "" : "s"}; ${r.rejected} rejected`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  const report = result ?? preview;
  const rows = report?.rows.filter((r) => filter === "all" || r.status === "rejected" || r.status === "skipped") ?? [];

  return (
    <div className="grid gap-4">
      {!report && (
        <Card
          className={cn("border-2 border-dashed p-0 transition", drag ? "border-pulse-400 bg-pulse-50" : "border-pulse-100")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            choose(e.dataTransfer.files[0] ?? null);
          }}
        >
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-b from-pulse-500 to-pulse-700 text-white"><FileSpreadsheet className="size-6" /></div>
            <p className="text-[15px] font-semibold text-ink">Drop a CSV file here</p>
            <p className="mt-1 text-[13px] text-ink-faint">Up to 1,000 rows / 1 MB. Every row is validated before anything is imported.</p>
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" id="csv-file" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="blue" onClick={() => input.current?.click()} loading={busy === "preview"}><Upload className="size-4" /> Choose file</Button>
              <a href="/api/import/sample" download className="inline-flex h-10 items-center rounded-full border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-pulse-50">Download sample CSV</a>
            </div>
          </div>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader
            title={result ? "Import complete" : "Validation report"}
            description={result ? `${report.filename} · job ${report.jobId?.slice(0, 8)}` : `${report.filename} · nothing has been imported yet`}
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => choose(null)}><RotateCcw className="size-3.5" /> New file</Button>
                {!result && (
                  <Button variant="blue" size="sm" onClick={runImport} loading={busy === "import"} disabled={report.valid === 0}>
                    Import {report.valid} valid row{report.valid === 1 ? "" : "s"}
                  </Button>
                )}
              </div>
            }
          />
          <div className="grid grid-cols-2 gap-3 px-5 pt-4 sm:grid-cols-4">
            {[
              ["Rows", report.total, "text-ink"],
              [result ? "Imported" : "Valid", result ? report.imported : report.valid, "text-emerald-700"],
              ["Rejected", report.rejected, "text-red-600"],
              ["Skipped (blank)", report.skipped, "text-ink-soft"],
            ].map(([k, v, c]) => (
              <div key={k as string} className="rounded-2xl bg-canvas px-4 py-3">
                <p className="text-[12px] text-ink-faint">{k}</p>
                <p className={cn("text-2xl font-semibold", c as string)}>{v}</p>
              </div>
            ))}
          </div>
          {result && (
            <p className="mx-5 mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
              <CheckCircle2 className="size-4" /> Only valid rows were imported. Rejected rows created no links; their reasons are listed below.
            </p>
          )}
          {report.unknownColumns && report.unknownColumns.length > 0 && (
            <p className="mx-5 mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Ignored unknown columns: {report.unknownColumns.join(", ")}</p>
          )}
          <div className="flex gap-2 px-5 pt-4" role="group" aria-label="Row filter">
            {(["all", "problems"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={cn("rounded-full px-3 py-1 text-[12.5px] font-medium", filter === f ? "bg-ink text-white" : "bg-canvas text-ink-soft")}>
                {f === "all" ? "All rows" : "Problems only"}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="text-[11.5px] text-ink-faint uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Destination</th>
                  <th className="px-3 py-2 font-medium">Alias</th>
                  <th className="px-3 py-2 font-medium">Errors / warnings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={cn("border-t border-line align-top", r.status === "rejected" && "bg-red-50/40")}>
                    <td className="px-3 py-2 font-mono text-ink-soft">{r.row}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-ink-soft" title={r.data.destination_url}>{r.data.destination_url || "—"}</td>
                    <td className="px-3 py-2 font-mono text-[12.5px]">{r.shortCode ? <span className="text-emerald-700">{host}/{r.shortCode}</span> : r.data.alias || <span className="text-ink-faint">random</span>}</td>
                    <td className="px-3 py-2">
                      {r.errors.map((e) => <p key={e} className="text-red-700">• {e}</p>)}
                      {r.warnings.map((w) => <p key={w} className="text-amber-700">• {w}</p>)}
                      {!r.errors.length && !r.warnings.length && <span className="text-ink-faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
