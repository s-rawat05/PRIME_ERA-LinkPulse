import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { campaigns, folders, tags, workspaces } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/users";
import { badRequest, conflict, isUniqueViolation, notFound } from "@/lib/errors";

const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optDate = z.union([z.string(), z.null()]).optional().transform((v, ctx) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: "custom", message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});

export const campaignSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  description: optText(500),
  utmSource: optText(60),
  utmMedium: optText(60),
  utmCampaign: optText(60),
  startsAt: optDate,
  endsAt: optDate,
});

async function workspaceId(db: Db, userId: string) {
  const [w] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, userId)).limit(1);
  if (w) return w.id;
  const [c] = await db.insert(workspaces).values({ name: "Personal", ownerId: userId }).returning({ id: workspaces.id });
  return c.id;
}

export async function createCampaign(db: Db, user: SessionUser, raw: unknown, opts: { synthetic?: boolean } = {}) {
  const v = campaignSchema.parse(raw);
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) throw badRequest("End date must be after the start date.", { endsAt: "Must be after start" });
  try {
    const [c] = await db.insert(campaigns).values({ ...v, ownerId: user.id, workspaceId: await workspaceId(db, user.id), isSynthetic: !!opts.synthetic }).returning();
    await audit(db, { actorId: user.id, action: "campaign.create", targetType: "campaign", targetId: c.id, after: { name: c.name } });
    return c;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`You already have a campaign named "${v.name}".`, { name: "Name already used" });
    throw err;
  }
}

export async function getCampaign(db: Db, user: SessionUser, id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound("Campaign");
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!c || (c.ownerId !== user.id && user.role !== "admin")) throw notFound("Campaign");
  return c;
}

export async function updateCampaign(db: Db, user: SessionUser, id: string, raw: unknown) {
  const c = await getCampaign(db, user, id);
  if (c.ownerId !== user.id) throw notFound("Campaign");
  const v = campaignSchema.partial().parse(raw);
  try {
    const [u] = await db.update(campaigns).set({ ...v, updatedAt: new Date() }).where(eq(campaigns.id, id)).returning();
    await audit(db, { actorId: user.id, action: "campaign.update", targetType: "campaign", targetId: id, before: { name: c.name }, after: { name: u.name } });
    return u;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("Another campaign already uses that name.", { name: "Name already used" });
    throw err;
  }
}

/** Links keep existing (campaign_id is set to NULL by the FK) and keep all their analytics. */
export async function deleteCampaign(db: Db, user: SessionUser, id: string) {
  const c = await getCampaign(db, user, id);
  if (c.ownerId !== user.id) throw notFound("Campaign");
  await db.delete(campaigns).where(eq(campaigns.id, id));
  await audit(db, { actorId: user.id, action: "campaign.delete", targetType: "campaign", targetId: id, before: { name: c.name } });
}

export type CampaignRow = {
  id: string; name: string; description: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  starts_at: string | null; ends_at: string | null; is_synthetic: boolean; created_at: string;
  link_count: number; clicks: number; uniques: number; qr_clicks: number; top_code: string | null; top_clicks: number | null;
};

/** Campaign performance computed from raw click events (human redirects only). */
export async function listCampaigns(db: Db, ownerId: string): Promise<CampaignRow[]> {
  const res = await db.execute<CampaignRow>(sql`
    WITH ev AS (
      SELECT l.campaign_id, l.id AS link_id, l.short_code, ce.visitor_hash, ce.source
      FROM links l JOIN click_events ce ON ce.link_id = l.id AND ce.outcome = 'redirected'
      WHERE l.owner_id = ${ownerId} AND l.campaign_id IS NOT NULL
    ),
    per_link AS (
      SELECT campaign_id, short_code, count(*) AS n,
        row_number() OVER (PARTITION BY campaign_id ORDER BY count(*) DESC, short_code) AS rk
      FROM ev GROUP BY campaign_id, short_code
    )
    SELECT c.id, c.name, c.description, c.utm_source, c.utm_medium, c.utm_campaign, c.starts_at, c.ends_at, c.is_synthetic, c.created_at,
      (SELECT count(*)::int FROM links l WHERE l.campaign_id = c.id AND l.deleted_at IS NULL) AS link_count,
      (SELECT count(*)::int FROM ev WHERE ev.campaign_id = c.id) AS clicks,
      (SELECT count(DISTINCT visitor_hash)::int FROM ev WHERE ev.campaign_id = c.id) AS uniques,
      (SELECT count(*)::int FROM ev WHERE ev.campaign_id = c.id AND ev.source = 'qr') AS qr_clicks,
      (SELECT short_code FROM per_link p WHERE p.campaign_id = c.id AND rk = 1) AS top_code,
      (SELECT n::int FROM per_link p WHERE p.campaign_id = c.id AND rk = 1) AS top_clicks
    FROM campaigns c WHERE c.owner_id = ${ownerId}
    ORDER BY c.created_at DESC`);
  return res.rows.map((r) => ({ ...r, link_count: Number(r.link_count), clicks: Number(r.clicks), uniques: Number(r.uniques), qr_clicks: Number(r.qr_clicks) }));
}

export async function campaignOptions(db: Db, ownerId: string) {
  return db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.ownerId, ownerId)).orderBy(asc(campaigns.name));
}

// ---------- Tags ----------

const COLORS = ["#2563eb", "#0ea5e9", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0d9488", "#ca8a04"];
export const tagSchema = z.object({
  name: z.string().trim().min(1).max(32).regex(/^[\p{L}\p{N} _-]+$/u, "Letters, numbers, spaces, - and _ only"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function createTag(db: Db, user: SessionUser, raw: unknown) {
  const v = tagSchema.parse(raw);
  const name = v.name.toLowerCase();
  try {
    const [t] = await db.insert(tags).values({ ownerId: user.id, name, color: v.color ?? COLORS[Math.floor(Math.random() * COLORS.length)] }).returning();
    await audit(db, { actorId: user.id, action: "tag.create", targetType: "tag", targetId: t.id, after: { name } });
    return t;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`Tag "${name}" already exists.`, { name: "Already exists" });
    throw err;
  }
}

export async function deleteTag(db: Db, user: SessionUser, id: string) {
  const del = await db.delete(tags).where(and(eq(tags.id, id), eq(tags.ownerId, user.id))).returning();
  if (!del.length) throw notFound("Tag");
  await audit(db, { actorId: user.id, action: "tag.delete", targetType: "tag", targetId: id, before: { name: del[0].name } });
}

export async function listTags(db: Db, ownerId: string) {
  const res = await db.execute<{ id: string; name: string; color: string; link_count: number }>(sql`
    SELECT t.id, t.name, t.color, count(lt.link_id)::int AS link_count
    FROM tags t LEFT JOIN link_tags lt ON lt.tag_id = t.id
    WHERE t.owner_id = ${ownerId} GROUP BY t.id ORDER BY t.name`);
  return res.rows;
}

// ---------- Folders ----------

export async function createFolder(db: Db, user: SessionUser, raw: unknown) {
  const v = z.object({ name: z.string().trim().min(1).max(60) }).parse(raw);
  try {
    const [f] = await db.insert(folders).values({ name: v.name, ownerId: user.id, workspaceId: await workspaceId(db, user.id) }).returning();
    await audit(db, { actorId: user.id, action: "folder.create", targetType: "folder", targetId: f.id, after: { name: v.name } });
    return f;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`Folder "${v.name}" already exists.`, { name: "Already exists" });
    throw err;
  }
}

export async function deleteFolder(db: Db, user: SessionUser, id: string) {
  const del = await db.delete(folders).where(and(eq(folders.id, id), eq(folders.ownerId, user.id))).returning();
  if (!del.length) throw notFound("Folder");
}

export async function listFolders(db: Db, ownerId: string) {
  return db.select().from(folders).where(eq(folders.ownerId, ownerId)).orderBy(asc(folders.name));
}
