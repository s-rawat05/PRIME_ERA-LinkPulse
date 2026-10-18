import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, blockedDomains, links, sessions, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/users";
import { invalidateLinks } from "@/lib/cache";
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from "@/lib/errors";
import { normalizeDomain } from "@/lib/links/url";

function assertAdmin(u: SessionUser) {
  if (u.role !== "admin") throw forbidden("Administrator access required.");
}

/** Short codes of every link whose destination (or any targeting rule) is on `domain` or a subdomain. */
async function codesForDomain(db: Db, domain: string): Promise<string[]> {
  const like = `%.${domain}`;
  const res = await db.execute<{ short_code: string }>(sql`
    SELECT l.short_code FROM links l
    WHERE l.destination_host = ${domain} OR l.destination_host LIKE ${like}
       OR EXISTS (SELECT 1 FROM redirect_rules r WHERE r.link_id = l.id AND (r.target_host = ${domain} OR r.target_host LIKE ${like}))`);
  return res.rows.map((r) => r.short_code);
}

export async function addBlockedDomain(db: Db, admin: SessionUser, raw: unknown) {
  assertAdmin(admin);
  const input = z.object({ domain: z.string().max(253), reason: z.string().trim().max(300).optional() }).parse(raw);
  const domain = normalizeDomain(input.domain);
  if (!domain) throw badRequest("Enter a valid domain such as example.com.", { domain: "Invalid domain" });
  try {
    const [row] = await db.insert(blockedDomains).values({ domain, reason: input.reason || null, addedBy: admin.id }).returning();
    const affected = await codesForDomain(db, domain);
    await invalidateLinks(affected);
    await audit(db, { actorId: admin.id, action: "admin.blocklist_add", targetType: "domain", targetId: domain, after: { reason: input.reason, affectedLinks: affected.length } });
    return { row, affectedLinks: affected.length };
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`${domain} is already blocklisted.`, { domain: "Already blocklisted" });
    throw err;
  }
}

export async function removeBlockedDomain(db: Db, admin: SessionUser, id: string) {
  assertAdmin(admin);
  const [row] = await db.delete(blockedDomains).where(eq(blockedDomains.id, id)).returning();
  if (!row) throw notFound("Blocked domain");
  await invalidateLinks(await codesForDomain(db, row.domain));
  await audit(db, { actorId: admin.id, action: "admin.blocklist_remove", targetType: "domain", targetId: row.domain, before: { reason: row.reason } });
}

export async function listBlockedDomains(db: Db) {
  const rows = await db
    .select({ d: blockedDomains, addedByEmail: users.email })
    .from(blockedDomains)
    .leftJoin(users, eq(users.id, blockedDomains.addedBy))
    .orderBy(desc(blockedDomains.createdAt));
  const counts = await db.execute<{ domain: string; n: number }>(sql`
    SELECT b.domain, count(l.id)::int AS n FROM blocked_domains b
    LEFT JOIN links l ON l.deleted_at IS NULL AND (l.destination_host = b.domain OR l.destination_host LIKE '%.' || b.domain)
    GROUP BY b.domain`);
  const map = new Map(counts.rows.map((r) => [r.domain, Number(r.n)]));
  return rows.map((r) => ({ ...r.d, addedByEmail: r.addedByEmail, linkCount: map.get(r.d.domain) ?? 0 }));
}

export async function listUsers(db: Db, q?: string) {
  const res = await db.execute<{
    id: string; email: string; name: string; role: "user" | "admin"; disabled_at: string | null; created_at: string; link_count: number; clicks: number;
  }>(sql`
    SELECT u.id, u.email, u.name, u.role, u.disabled_at, u.created_at,
      (SELECT count(*)::int FROM links l WHERE l.owner_id = u.id AND l.deleted_at IS NULL) AS link_count,
      (SELECT count(*)::int FROM click_events ce JOIN links l ON l.id = ce.link_id WHERE l.owner_id = u.id AND ce.outcome = 'redirected') AS clicks
    FROM users u
    ${q ? sql`WHERE u.email ILIKE ${"%" + q + "%"} OR u.name ILIKE ${"%" + q + "%"}` : sql``}
    ORDER BY u.created_at DESC LIMIT 200`);
  return res.rows;
}

export async function updateUser(db: Db, admin: SessionUser, userId: string, raw: unknown) {
  assertAdmin(admin);
  const input = z.object({ role: z.enum(["user", "admin"]).optional(), disabled: z.boolean().optional() }).parse(raw);
  if (userId === admin.id && (input.role === "user" || input.disabled)) throw badRequest("You cannot demote or disable your own account.");
  const [before] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!before) throw notFound("User");
  const values: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.role) values.role = input.role;
  if (input.disabled !== undefined) values.disabledAt = input.disabled ? new Date() : null;
  const [after] = await db.update(users).set(values).where(eq(users.id, userId)).returning();
  // Disabling revokes every active session immediately.
  if (input.disabled) await db.delete(sessions).where(eq(sessions.userId, userId));
  await audit(db, { actorId: admin.id, action: "admin.user_update", targetType: "user", targetId: userId, before: { role: before.role, disabledAt: before.disabledAt }, after: { role: after.role, disabledAt: after.disabledAt } });
  return after;
}

export async function listAudit(db: Db, opts: { q?: string; limit?: number } = {}) {
  const where = opts.q ? or(ilike(auditLog.action, `%${opts.q}%`), ilike(auditLog.targetId, `%${opts.q}%`)) : undefined;
  return db
    .select({ a: auditLog, actorEmail: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(where)
    .orderBy(desc(auditLog.id))
    .limit(Math.min(opts.limit ?? 100, 500));
}

/** Basic abuse signals derived from real events over the last 24 hours. */
export async function abuseAlerts(db: Db) {
  const res = await db.execute<{ kind: string; link_id: string; short_code: string; destination_host: string; n: number }>(sql`
    WITH recent AS (
      SELECT link_id, outcome FROM click_events WHERE occurred_at > now() - interval '24 hours' AND link_id IS NOT NULL
    )
    SELECT 'password_bruteforce' AS kind, r.link_id, l.short_code, l.destination_host, count(*)::int AS n
      FROM recent r JOIN links l ON l.id = r.link_id WHERE r.outcome = 'password_failed'
      GROUP BY r.link_id, l.short_code, l.destination_host HAVING count(*) >= 10
    UNION ALL
    SELECT 'traffic_spike', r.link_id, l.short_code, l.destination_host, count(*)::int
      FROM recent r JOIN links l ON l.id = r.link_id WHERE r.outcome = 'redirected' AND l.status = 'active'
      GROUP BY r.link_id, l.short_code, l.destination_host HAVING count(*) >= 500
    UNION ALL
    SELECT 'blocked_hits', r.link_id, l.short_code, l.destination_host, count(*)::int
      FROM recent r JOIN links l ON l.id = r.link_id WHERE r.outcome = 'disabled'
      GROUP BY r.link_id, l.short_code, l.destination_host HAVING count(*) >= 5
    ORDER BY n DESC LIMIT 20`);
  const flagged = await db.select({ id: links.id, shortCode: links.shortCode, host: links.destinationHost }).from(links).where(and(eq(links.safetyStatus, "flagged"))).limit(20);
  return { signals: res.rows, flagged };
}
