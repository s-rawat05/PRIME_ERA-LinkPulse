import Papa from "papaparse";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { campaigns, importJobs, importRows, tags } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/users";
import { AppError, badRequest } from "@/lib/errors";
import { normalizeAlias } from "@/lib/links/codes";
import { createLink, validateLinkInput } from "@/lib/links/service";

/**
 * CSV schema (header row required, case-insensitive):
 *   destination_url (required) | alias | title | campaign | tags | expires_at | max_clicks | password
 * - campaign: name of an existing campaign you own
 * - tags: names separated by ";" (created if missing)
 * - expires_at: ISO 8601 date/time, e.g. 2026-12-31 or 2026-12-31T18:00:00Z
 *
 * Partial-import policy: every row is validated independently. Valid rows are imported, invalid
 * rows are rejected with their reasons, and blank rows are skipped. A rejected row never creates a link.
 */
export const CSV_COLUMNS = ["destination_url", "alias", "title", "campaign", "tags", "expires_at", "max_clicks", "password"] as const;
export const MAX_ROWS = 1000;
export const MAX_BYTES = 1_000_000;

const HEADER_ALIASES: Record<string, string> = {
  url: "destination_url", destination: "destination_url", long_url: "destination_url", destinationurl: "destination_url", target: "destination_url",
  short_code: "alias", code: "alias", slug: "alias", custom_alias: "alias",
  expiry: "expires_at", expires: "expires_at", maxclicks: "max_clicks", click_limit: "max_clicks", tag: "tags",
};

export type RowReport = { row: number; status: "valid" | "imported" | "rejected" | "skipped"; errors: string[]; warnings: string[]; data: Record<string, string>; shortCode?: string };
export type ImportReport = { jobId?: string; filename: string; total: number; valid: number; imported: number; rejected: number; skipped: number; rows: RowReport[] };

function parseCsv(text: string) {
  if (text.length > MAX_BYTES) throw badRequest(`File is larger than ${MAX_BYTES / 1_000_000} MB.`);
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    // Truly empty lines (e.g. the final newline) are ignored; rows of only delimiters are reported as skipped.
    skipEmptyLines: true,
    transformHeader: (h) => {
      const k = h.trim().toLowerCase().replace(/[\s-]+/g, "_");
      return HEADER_ALIASES[k] ?? k;
    },
  });
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes("destination_url")) throw badRequest(`Missing required column "destination_url". Expected columns: ${CSV_COLUMNS.join(", ")}.`);
  const rows = parsed.data;
  if (rows.length > MAX_ROWS) throw badRequest(`Too many rows (${rows.length}). The limit is ${MAX_ROWS} per file.`);
  const unknown = fields.filter((f) => f && !(CSV_COLUMNS as readonly string[]).includes(f));
  return { rows, unknown, parseErrors: parsed.errors };
}

async function validateRows(db: Db, user: SessionUser, text: string) {
  const { rows, unknown, parseErrors } = parseCsv(text);
  const myCampaigns = await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.ownerId, user.id));
  const campaignByName = new Map(myCampaigns.map((c) => [c.name.toLowerCase(), c.id]));
  const seenAlias = new Map<string, number>();
  const rowErrors = new Map<number, string[]>();
  for (const e of parseErrors) if (typeof e.row === "number") rowErrors.set(e.row, [...(rowErrors.get(e.row) ?? []), `CSV format: ${e.message}`]);

  const reports: (RowReport & { input?: Record<string, unknown> })[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // header is row 1
    const data = Object.fromEntries(CSV_COLUMNS.map((c) => [c, String(r[c] ?? "").trim()]));
    if (Object.values(data).every((v) => !v)) {
      reports.push({ row: rowNum, status: "skipped", errors: [], warnings: ["Blank row"], data });
      continue;
    }
    const errors = [...(rowErrors.get(i) ?? [])];
    const warnings: string[] = [];

    let campaignId: string | null = null;
    if (data.campaign) {
      campaignId = campaignByName.get(data.campaign.toLowerCase()) ?? null;
      if (!campaignId) errors.push(`Campaign "${data.campaign}" does not exist. Create it first.`);
    }
    if (data.alias) {
      const a = normalizeAlias(data.alias);
      const first = seenAlias.get(a);
      if (first) errors.push(`Duplicate alias "${a}" in this file (first used on row ${first}).`);
      else seenAlias.set(a, rowNum);
    }
    if (data.max_clicks && !/^\d+$/.test(data.max_clicks)) errors.push("max_clicks must be a positive whole number.");
    if (data.expires_at && Number.isNaN(Date.parse(data.expires_at))) errors.push(`expires_at "${data.expires_at}" is not a valid date.`);

    const input = {
      destinationUrl: data.destination_url,
      alias: data.alias || null,
      title: data.title || null,
      campaignId,
      expiresAt: data.expires_at && !Number.isNaN(Date.parse(data.expires_at)) ? new Date(data.expires_at).toISOString() : null,
      maxClicks: data.max_clicks && /^\d+$/.test(data.max_clicks) ? Number(data.max_clicks) : null,
      password: data.password || null,
    };
    const v = await validateLinkInput(db, user, input, { mode: "create" });
    for (const [field, msg] of Object.entries(v.errors)) {
      if (field === "campaignId" && data.campaign) continue; // already reported by name
      if (field === "expiresAt" && errors.some((e) => e.startsWith("expires_at"))) continue;
      errors.push(msg);
    }
    warnings.push(...v.warnings);
    reports.push({ row: rowNum, status: errors.length ? "rejected" : "valid", errors, warnings, data: { ...data, password: data.password ? "••••" : "" }, input });
  }
  return { reports, unknown };
}

/** Dry run: validates every row and writes nothing. */
export async function previewImport(db: Db, user: SessionUser, filename: string, text: string): Promise<ImportReport & { unknownColumns: string[] }> {
  const { reports, unknown } = await validateRows(db, user, text);
  return {
    filename,
    total: reports.length,
    valid: reports.filter((r) => r.status === "valid").length,
    imported: 0,
    rejected: reports.filter((r) => r.status === "rejected").length,
    skipped: reports.filter((r) => r.status === "skipped").length,
    rows: reports.map(({ input: _i, ...r }) => r),
    unknownColumns: unknown,
  };
}

async function ensureTags(db: Db, user: SessionUser, names: string[]): Promise<string[]> {
  const wanted = [...new Set(names.map((n) => n.trim().toLowerCase()).filter((n) => n && n.length <= 32))];
  if (!wanted.length) return [];
  const existing = await db.select().from(tags).where(and(eq(tags.ownerId, user.id), inArray(tags.name, wanted)));
  const have = new Map(existing.map((t) => [t.name, t.id]));
  for (const n of wanted) {
    if (have.has(n)) continue;
    const [t] = await db.insert(tags).values({ ownerId: user.id, name: n }).onConflictDoNothing().returning();
    if (t) have.set(n, t.id);
    else {
      const [again] = await db.select().from(tags).where(and(eq(tags.ownerId, user.id), eq(tags.name, n)));
      if (again) have.set(n, again.id);
    }
  }
  return wanted.map((n) => have.get(n)!).filter(Boolean);
}

/** Validates again (state may have changed since the preview) and imports only valid rows. */
export async function runImport(db: Db, user: SessionUser, filename: string, text: string): Promise<ImportReport> {
  const { reports } = await validateRows(db, user, text);
  const [job] = await db.insert(importJobs).values({ ownerId: user.id, filename: filename.slice(0, 200), totalRows: reports.length }).returning();

  for (const r of reports) {
    if (r.status !== "valid") continue;
    try {
      const tagIds = await ensureTags(db, user, r.data.tags ? r.data.tags.split(/[;|]/) : []);
      const { link } = await createLink(db, user, { ...r.input, tagIds }, { source: "csv_import" });
      r.status = "imported";
      r.shortCode = link.shortCode;
      (r as RowReport & { linkId?: string }).linkId = link.id;
    } catch (err) {
      r.status = "rejected";
      r.errors.push(err instanceof AppError ? err.message : "Unexpected error while importing this row.");
      if (!(err instanceof AppError)) console.error("[csv] row import failed", err);
    }
  }

  const counts = {
    importedRows: reports.filter((r) => r.status === "imported").length,
    rejectedRows: reports.filter((r) => r.status === "rejected").length,
    skippedRows: reports.filter((r) => r.status === "skipped").length,
  };
  await db.update(importJobs).set(counts).where(eq(importJobs.id, job.id));
  if (reports.length) {
    await db.insert(importRows).values(
      reports.map((r) => ({
        jobId: job.id,
        rowNumber: r.row,
        raw: r.data,
        status: r.status === "imported" ? ("imported" as const) : r.status === "skipped" ? ("skipped" as const) : ("rejected" as const),
        errors: r.errors,
        linkId: (r as RowReport & { linkId?: string }).linkId ?? null,
      })),
    );
  }
  await audit(db, { actorId: user.id, action: "import.run", targetType: "import_job", targetId: job.id, after: { filename, total: reports.length, ...counts } });

  return {
    jobId: job.id,
    filename,
    total: reports.length,
    valid: counts.importedRows,
    imported: counts.importedRows,
    rejected: counts.rejectedRows,
    skipped: counts.skippedRows,
    rows: reports.map(({ input: _i, ...r }) => r),
  };
}

export async function listImportJobs(db: Db, ownerId: string) {
  return db.select().from(importJobs).where(eq(importJobs.ownerId, ownerId)).orderBy(desc(importJobs.createdAt)).limit(20);
}

export async function getImportJob(db: Db, user: SessionUser, id: string) {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
  if (!job || (job.ownerId !== user.id && user.role !== "admin")) return null;
  const rows = await db.select().from(importRows).where(eq(importRows.jobId, id)).orderBy(importRows.rowNumber);
  return { job, rows };
}

export const SAMPLE_CSV = `destination_url,alias,title,campaign,tags,expires_at,max_clicks,password
https://example.com/diwali-offers,diwali-offers,Diwali offers,Diwali Sale,festive;sale,2027-01-15,,
https://example.com/app,,App download,,mobile,,500,
not-a-url,broken-row,Malformed URL,,,,,
javascript:alert(1),xss-try,Unsafe scheme,,,,,
https://example.com/dup,diwali-offers,Duplicate alias in file,,,,,
https://example.com/admin,admin,Reserved alias,,,,,
https://example.com/old,old-promo,Past expiry,,,2020-01-01,,
,,,,,,,
https://example.com/vip,vip-preview,VIP preview,,vip,,,letmein
`;
