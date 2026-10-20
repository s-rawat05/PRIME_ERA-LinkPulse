import type { Db } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditEntry = {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
};

/** Never store secrets in the audit trail. */
function scrub(v: unknown): unknown {
  if (!v || typeof v !== "object") return v ?? null;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (/password|token|hash/i.test(k)) out[k] = val ? "[redacted]" : null;
    else out[k] = val instanceof Date ? val.toISOString() : val;
  }
  return out;
}

export async function audit(db: Db, e: AuditEntry) {
  await db.insert(auditLog).values({
    actorId: e.actorId,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId ?? null,
    before: scrub(e.before),
    after: scrub(e.after),
  });
}
