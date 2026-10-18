import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { campaigns, folders, links, linkTags, redirectRules, tags, workspaces, type Link } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/users";
import { invalidateLinks } from "@/lib/cache";
import { AppError, badRequest, conflict, forbidden, isUniqueViolation, notFound } from "@/lib/errors";
import { generateShortCode, validateAliasFormat } from "./codes";
import { findBlockedDomain, scanUrl } from "./safety";
import { validateDestination } from "./url";

const optStr = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optUuid = z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));

export const linkInputSchema = z.object({
  destinationUrl: z.string().max(4096),
  alias: optStr(64),
  title: optStr(120),
  campaignId: optUuid,
  folderId: optUuid,
  tagIds: z.array(z.uuid()).max(20).optional().default([]),
  expiresAt: z.union([z.string(), z.null()]).optional().transform((v) => (v ? v : null)),
  expiredUrl: optStr(4096),
  maxClicks: z.union([z.number(), z.string(), z.null()]).optional().transform((v) => (v === "" || v === null || v === undefined ? null : Number(v))),
  password: z.string().max(128).optional().nullable().transform((v) => (v ? v : null)),
});
export type LinkInput = z.input<typeof linkInputSchema>;

export type ValidationReport = {
  ok: boolean;
  errors: Record<string, string>;
  warnings: string[];
  normalized: {
    destinationUrl: string;
    destinationHost: string;
    alias: string | null;
    title: string | null;
    campaignId: string | null;
    folderId: string | null;
    tagIds: string[];
    expiresAt: Date | null;
    expiredUrl: string | null;
    maxClicks: number | null;
    password: string | null;
  };
};

/**
 * Runs every pre-publish check used by the wizard's review step, the create/update API and CSV
 * import, so all three surface identical errors. Errors block publishing; warnings do not.
 */
export async function validateLinkInput(
  db: Db,
  user: SessionUser,
  raw: unknown,
  opts: { mode: "create" | "update"; existing?: Link; checkAliasTaken?: boolean } = { mode: "create" },
): Promise<ValidationReport> {
  const parsed = linkInputSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "_"), i.message]));
    return { ok: false, errors, warnings: [], normalized: null as never };
  }
  const v = parsed.data;
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  // Destination
  let destinationUrl = v.destinationUrl.trim();
  let destinationHost = "";
  const dest = validateDestination(destinationUrl);
  if (!dest.ok) errors.destinationUrl = dest.reason;
  else {
    destinationUrl = dest.url;
    destinationHost = dest.host;
    const blocked = await findBlockedDomain(db, dest.host);
    if (blocked) errors.destinationUrl = `The domain "${blocked}" is on the platform blocklist.`;
    else if (dest.url.startsWith("http://")) warnings.push("Destination uses plain http://; consider https:// so visitors are not warned by their browser.");
  }

  // Alias
  let alias: string | null = null;
  if (opts.mode === "create" && v.alias) {
    const a = validateAliasFormat(v.alias);
    alias = a.alias;
    if (!a.ok) errors.alias = a.reason;
    else if (opts.checkAliasTaken !== false) {
      const taken = await db.select({ id: links.id }).from(links).where(eq(links.shortCode, a.alias)).limit(1);
      if (taken.length) errors.alias = `The alias "${a.alias}" is already taken.`;
    }
  }

  // Expiry
  let expiresAt: Date | null = null;
  if (v.expiresAt) {
    const d = new Date(v.expiresAt);
    if (Number.isNaN(d.getTime())) errors.expiresAt = "Expiry is not a valid date.";
    else if (d.getTime() <= Date.now()) errors.expiresAt = "Expiry date is in the past.";
    else {
      expiresAt = d;
      if (d.getTime() - Date.now() < 60 * 60 * 1000) warnings.push("This link expires in less than an hour.");
    }
  }
  let expiredUrl: string | null = null;
  if (v.expiredUrl) {
    const e = validateDestination(v.expiredUrl);
    if (!e.ok) errors.expiredUrl = e.reason;
    else if (await findBlockedDomain(db, e.host)) errors.expiredUrl = "The expiry fallback domain is blocklisted.";
    else expiredUrl = e.url;
    if (!v.expiresAt) warnings.push("An expiry fallback URL has no effect without an expiry date.");
  }

  // Click cap
  const maxClicks = v.maxClicks;
  if (maxClicks !== null) {
    if (!Number.isInteger(maxClicks) || maxClicks < 1 || maxClicks > 100_000_000) errors.maxClicks = "Click limit must be a whole number of at least 1.";
    else if (opts.existing && maxClicks <= opts.existing.clickCount) warnings.push(`This link already has ${opts.existing.clickCount} counted clicks, so a limit of ${maxClicks} blocks it immediately.`);
  }

  // Password
  if (v.password && v.password.length < 4) errors.password = "Password must be at least 4 characters.";

  // Ownership of referenced resources (never trust ids from the client)
  if (v.campaignId) {
    const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, v.campaignId), eq(campaigns.ownerId, user.id))).limit(1);
    if (!c) errors.campaignId = "Campaign not found.";
    else if (c.endsAt && c.endsAt.getTime() < Date.now()) warnings.push(`Campaign "${c.name}" has already ended.`);
  }
  if (v.folderId) {
    const [f] = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.id, v.folderId), eq(folders.ownerId, user.id))).limit(1);
    if (!f) errors.folderId = "Folder not found.";
  }
  const tagIds = [...new Set(v.tagIds)];
  if (tagIds.length) {
    const own = await db.select({ id: tags.id }).from(tags).where(and(inArray(tags.id, tagIds), eq(tags.ownerId, user.id)));
    if (own.length !== tagIds.length) errors.tagIds = "One or more tags were not found.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    warnings,
    normalized: { destinationUrl, destinationHost, alias, title: v.title, campaignId: v.campaignId, folderId: v.folderId, tagIds, expiresAt, expiredUrl, maxClicks, password: v.password },
  };
}

async function personalWorkspace(db: Db, userId: string): Promise<string> {
  const [w] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, userId)).limit(1);
  if (w) return w.id;
  const [created] = await db.insert(workspaces).values({ name: "Personal", ownerId: userId }).returning({ id: workspaces.id });
  return created.id;
}

export type CreateOptions = { synthetic?: boolean; skipScan?: boolean; source?: string };

export async function createLink(db: Db, user: SessionUser, raw: unknown, opts: CreateOptions = {}) {
  const report = await validateLinkInput(db, user, raw, { mode: "create" });
  if (!report.ok) throw new AppError(400, "invalid", Object.values(report.errors)[0] ?? "Invalid link.", report.errors);
  const n = report.normalized;

  const scan = opts.skipScan ? { status: "not_scanned" as const, detail: "skipped" } : await scanUrl(n.destinationUrl);
  if (scan.status === "flagged") throw badRequest(scan.detail, { destinationUrl: scan.detail });

  const workspaceId = await personalWorkspace(db, user.id);
  const passwordHash = n.password ? await hashPassword(n.password) : null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const shortCode = n.alias ?? generateShortCode();
    try {
      const link = await db.transaction(async (tx) => {
        const [l] = await tx
          .insert(links)
          .values({
            shortCode,
            title: n.title,
            destinationUrl: n.destinationUrl,
            destinationHost: n.destinationHost,
            isCustomAlias: !!n.alias,
            expiresAt: n.expiresAt,
            expiredUrl: n.expiredUrl,
            maxClicks: n.maxClicks,
            passwordHash,
            campaignId: n.campaignId,
            folderId: n.folderId,
            workspaceId,
            ownerId: user.id,
            safetyStatus: scan.status,
            isSynthetic: !!opts.synthetic,
          })
          .returning();
        if (n.tagIds.length) await tx.insert(linkTags).values(n.tagIds.map((tagId) => ({ linkId: l.id, tagId })));
        await audit(tx as unknown as Db, { actorId: user.id, action: "link.create", targetType: "link", targetId: l.id, after: { shortCode, destinationUrl: n.destinationUrl, source: opts.source ?? "wizard", passwordHash } });
        return l;
      });
      // A negative "not found" may have been cached for this code before it existed.
      await invalidateLinks([shortCode]);
      return { link, warnings: report.warnings, scan };
    } catch (err) {
      if (isUniqueViolation(err, "links_short_code_uq")) {
        // The UNIQUE index is the final arbiter for two tabs racing on the same alias.
        if (n.alias) throw conflict(`The alias "${n.alias}" is already taken.`, { alias: `The alias "${n.alias}" is already taken.` });
        continue; // random collision: retry with a new code
      }
      throw err;
    }
  }
  throw new AppError(503, "code_exhausted", "Could not allocate a unique short code. Please retry.");
}

/** Owners see their own non-deleted links; admins can see any link. Missing and foreign links both look like 404. */
export async function getLinkForUser(db: Db, user: SessionUser, id: string, opts: { allowAdmin?: boolean } = {}) {
  if (!z.uuid().safeParse(id).success) throw notFound("Link");
  const [l] = await db.select().from(links).where(and(eq(links.id, id), isNull(links.deletedAt))).limit(1);
  if (!l) throw notFound("Link");
  if (l.ownerId !== user.id && !(opts.allowAdmin && user.role === "admin")) throw notFound("Link");
  return l;
}

const updateSchema = linkInputSchema.partial().extend({ clearPassword: z.boolean().optional() });

export async function updateLink(db: Db, user: SessionUser, id: string, raw: unknown) {
  const existing = await getLinkForUser(db, user, id);
  const patch = updateSchema.parse(raw);
  const merged = {
    destinationUrl: patch.destinationUrl ?? existing.destinationUrl,
    title: patch.title !== undefined ? patch.title : existing.title,
    campaignId: patch.campaignId !== undefined ? patch.campaignId : existing.campaignId,
    folderId: patch.folderId !== undefined ? patch.folderId : existing.folderId,
    tagIds: patch.tagIds,
    expiresAt: patch.expiresAt !== undefined ? patch.expiresAt : existing.expiresAt?.toISOString() ?? null,
    expiredUrl: patch.expiredUrl !== undefined ? patch.expiredUrl : existing.expiredUrl,
    maxClicks: patch.maxClicks !== undefined ? patch.maxClicks : existing.maxClicks,
    password: patch.password ?? null,
  };
  const report = await validateLinkInput(db, user, merged, { mode: "update", existing });
  // An unchanged expiry that has since passed should not block unrelated edits.
  if (report.errors.expiresAt && patch.expiresAt === undefined) delete report.errors.expiresAt;
  if (Object.keys(report.errors).length) throw new AppError(400, "invalid", Object.values(report.errors)[0], report.errors);
  const n = report.normalized;

  const values: Partial<typeof links.$inferInsert> = {
    destinationUrl: n.destinationUrl,
    destinationHost: n.destinationHost,
    title: n.title,
    campaignId: n.campaignId,
    folderId: n.folderId,
    expiresAt: patch.expiresAt === undefined ? existing.expiresAt : n.expiresAt,
    expiredUrl: n.expiredUrl,
    maxClicks: n.maxClicks,
    updatedAt: new Date(),
  };
  if (patch.clearPassword) values.passwordHash = null;
  else if (n.password) values.passwordHash = await hashPassword(n.password);
  if (n.destinationUrl !== existing.destinationUrl) {
    const scan = await scanUrl(n.destinationUrl);
    if (scan.status === "flagged") throw badRequest(scan.detail, { destinationUrl: scan.detail });
    values.safetyStatus = scan.status;
  }

  const updated = await db.transaction(async (tx) => {
    const [u] = await tx.update(links).set(values).where(eq(links.id, id)).returning();
    if (patch.tagIds) {
      await tx.delete(linkTags).where(eq(linkTags.linkId, id));
      if (n.tagIds.length) await tx.insert(linkTags).values(n.tagIds.map((tagId) => ({ linkId: id, tagId })));
    }
    await audit(tx as unknown as Db, { actorId: user.id, action: "link.update", targetType: "link", targetId: id, before: pick(existing), after: pick(u) });
    return u;
  });
  await invalidateLinks([existing.shortCode]);
  return { link: updated, warnings: report.warnings };
}

function pick(l: Link) {
  return {
    destinationUrl: l.destinationUrl, status: l.status, expiresAt: l.expiresAt, maxClicks: l.maxClicks,
    campaignId: l.campaignId, title: l.title, passwordHash: l.passwordHash, expiredUrl: l.expiredUrl,
  };
}

/** Owner pause/resume. An owner can never re-enable an administrator takedown. */
export async function setOwnerStatus(db: Db, user: SessionUser, id: string, status: "active" | "paused") {
  const l = await getLinkForUser(db, user, id);
  if (l.status === "disabled") throw forbidden("This link was disabled by an administrator and cannot be changed by its owner.");
  const [u] = await db.update(links).set({ status, updatedAt: new Date() }).where(eq(links.id, id)).returning();
  await invalidateLinks([l.shortCode]);
  await audit(db, { actorId: user.id, action: status === "paused" ? "link.pause" : "link.resume", targetType: "link", targetId: id, before: { status: l.status }, after: { status } });
  return u;
}

/** Soft delete: the code stays reserved (UNIQUE) and every click event is preserved. */
export async function deleteLink(db: Db, user: SessionUser, id: string) {
  const l = await getLinkForUser(db, user, id);
  await db.update(links).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(links.id, id));
  await invalidateLinks([l.shortCode]);
  await audit(db, { actorId: user.id, action: "link.delete", targetType: "link", targetId: id, before: { shortCode: l.shortCode } });
}

/** Admin takedown: database update + cache delete in the same request, so the next hit is blocked. */
export async function adminSetDisabled(db: Db, admin: SessionUser, id: string, disabled: boolean, reason?: string) {
  if (admin.role !== "admin") throw forbidden();
  const [l] = await db.select().from(links).where(eq(links.id, id)).limit(1);
  if (!l) throw notFound("Link");
  const values = disabled
    ? { status: "disabled" as const, disabledReason: (reason ?? "").trim().slice(0, 300) || "Disabled by administrator", disabledBy: admin.id, disabledAt: new Date(), updatedAt: new Date() }
    : { status: "active" as const, disabledReason: null, disabledBy: null, disabledAt: null, updatedAt: new Date() };
  const [u] = await db.update(links).set(values).where(eq(links.id, id)).returning();
  await invalidateLinks([l.shortCode]);
  await audit(db, { actorId: admin.id, action: disabled ? "admin.link_disable" : "admin.link_enable", targetType: "link", targetId: id, before: { status: l.status, reason: l.disabledReason }, after: { status: u.status, reason: u.disabledReason } });
  return u;
}

// ---------- Redirect (targeting) rules ----------

export const ruleSchema = z.object({
  conditionType: z.enum(["device", "os", "country"]),
  conditionValue: z.string().trim().min(1).max(40),
  targetUrl: z.string().max(4096),
  priority: z.coerce.number().int().min(1).max(100).optional(),
});

export async function addRule(db: Db, user: SessionUser, linkId: string, raw: unknown) {
  const l = await getLinkForUser(db, user, linkId);
  const r = ruleSchema.parse(raw);
  const value = r.conditionValue.toLowerCase();
  if (r.conditionType === "device" && !["mobile", "tablet", "desktop"].includes(value)) throw badRequest("Device must be mobile, tablet or desktop.", { conditionValue: "mobile, tablet or desktop" });
  if (r.conditionType === "country" && !/^[a-z]{2}$/.test(value)) throw badRequest("Country must be a 2-letter ISO code, e.g. IN.", { conditionValue: "2-letter ISO code" });
  const dest = validateDestination(r.targetUrl);
  if (!dest.ok) throw badRequest(dest.reason, { targetUrl: dest.reason });
  if (await findBlockedDomain(db, dest.host)) throw badRequest("Target domain is blocklisted.", { targetUrl: "Blocklisted domain" });
  const existing = await db.select({ p: redirectRules.priority }).from(redirectRules).where(eq(redirectRules.linkId, linkId));
  const priority = r.priority ?? (existing.length ? Math.max(...existing.map((e) => e.p)) + 1 : 1);
  if (existing.some((e) => e.p === priority)) throw conflict(`Priority ${priority} is already used on this link.`, { priority: "Already used" });
  const [rule] = await db.insert(redirectRules).values({ linkId, priority, conditionType: r.conditionType, conditionValue: value, targetUrl: dest.url, targetHost: dest.host }).returning();
  await invalidateLinks([l.shortCode]);
  await audit(db, { actorId: user.id, action: "rule.create", targetType: "link", targetId: linkId, after: { priority, conditionType: r.conditionType, conditionValue: value, targetUrl: dest.url } });
  return rule;
}

export async function deleteRule(db: Db, user: SessionUser, linkId: string, ruleId: string) {
  const l = await getLinkForUser(db, user, linkId);
  const del = await db.delete(redirectRules).where(and(eq(redirectRules.id, ruleId), eq(redirectRules.linkId, linkId))).returning();
  if (!del.length) throw notFound("Rule");
  await invalidateLinks([l.shortCode]);
  await audit(db, { actorId: user.id, action: "rule.delete", targetType: "link", targetId: linkId, before: { ruleId } });
}

// ---------- Listing ----------

export type LinkFilters = { q?: string; status?: string; campaignId?: string; tagId?: string; folderId?: string; ownerId?: string; limit?: number };

export async function listLinks(db: Db, scope: { ownerId?: string }, f: LinkFilters = {}) {
  const conds: SQL[] = [isNull(links.deletedAt)];
  if (scope.ownerId) conds.push(eq(links.ownerId, scope.ownerId));
  if (f.q) {
    const q = `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(or(ilike(links.shortCode, q), ilike(links.destinationUrl, q), ilike(links.title, q))!);
  }
  if (f.status === "expired") conds.push(sql`${links.expiresAt} IS NOT NULL AND ${links.expiresAt} <= now()`);
  else if (f.status === "active") conds.push(eq(links.status, "active"), sql`(${links.expiresAt} IS NULL OR ${links.expiresAt} > now())`);
  else if (f.status === "paused" || f.status === "disabled") conds.push(eq(links.status, f.status));
  if (f.campaignId && z.uuid().safeParse(f.campaignId).success) conds.push(eq(links.campaignId, f.campaignId));
  if (f.folderId && z.uuid().safeParse(f.folderId).success) conds.push(eq(links.folderId, f.folderId));
  if (f.tagId && z.uuid().safeParse(f.tagId).success) conds.push(sql`EXISTS (SELECT 1 FROM link_tags lt WHERE lt.link_id = ${links.id} AND lt.tag_id = ${f.tagId})`);

  const rows = await db
    .select({
      link: links,
      campaignName: campaigns.name,
      humanClicks: sql<number>`(SELECT count(*) FROM click_events ce WHERE ce.link_id = ${links.id} AND ce.outcome = 'redirected')`.mapWith(Number),
    })
    .from(links)
    .leftJoin(campaigns, eq(campaigns.id, links.campaignId))
    .where(and(...conds))
    .orderBy(desc(links.createdAt))
    .limit(Math.min(f.limit ?? 200, 500));

  const ids = rows.map((r) => r.link.id);
  const tagRows = ids.length
    ? await db.select({ linkId: linkTags.linkId, id: tags.id, name: tags.name, color: tags.color }).from(linkTags).innerJoin(tags, eq(tags.id, linkTags.tagId)).where(inArray(linkTags.linkId, ids))
    : [];
  return rows.map((r) => ({ ...r, tags: tagRows.filter((t) => t.linkId === r.link.id) }));
}

export function effectiveStatus(l: Pick<Link, "status" | "expiresAt" | "maxClicks" | "clickCount" | "deletedAt">, now = Date.now()) {
  if (l.deletedAt) return "deleted" as const;
  if (l.status === "disabled") return "disabled" as const;
  if (l.status === "paused") return "paused" as const;
  if (l.expiresAt && l.expiresAt.getTime() <= now) return "expired" as const;
  if (l.maxClicks !== null && l.clickCount >= l.maxClicks) return "limit_reached" as const;
  return "active" as const;
}
