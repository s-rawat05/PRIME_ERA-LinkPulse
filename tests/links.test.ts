import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { links, linkTags } from "@/db/schema";
import { addBlockedDomain } from "@/lib/admin/service";
import type { SessionUser } from "@/lib/auth/users";
import { generateShortCode, validateAliasFormat } from "@/lib/links/codes";
import { createLink, deleteLink, getLinkForUser, updateLink, validateLinkInput } from "@/lib/links/service";
import { validateDestination } from "@/lib/links/url";
import { createCampaign, createTag, listTags } from "@/lib/org/service";
import { db, makeUser } from "./helpers";

let alice: SessionUser;
let bob: SessionUser;
let admin: SessionUser;
beforeAll(async () => {
  alice = await makeUser();
  bob = await makeUser();
  admin = await makeUser("admin");
});

describe("short codes and aliases", () => {
  it("generates 7-char lowercase base36 codes without collisions in a sample", () => {
    const set = new Set(Array.from({ length: 5000 }, () => generateShortCode()));
    expect(set.size).toBe(5000);
    for (const c of set) expect(c).toMatch(/^[0-9a-z]{7}$/);
  });

  it("normalises case and rejects malformed or reserved aliases", () => {
    expect(validateAliasFormat("  Diwali-Sale ")).toEqual({ ok: true, alias: "diwali-sale" });
    expect(validateAliasFormat("ab").ok).toBe(false);
    expect(validateAliasFormat("-abc").ok).toBe(false);
    expect(validateAliasFormat("has space").ok).toBe(false);
    expect(validateAliasFormat("x".repeat(33)).ok).toBe(false);
    expect(validateAliasFormat("dashboard")).toMatchObject({ ok: false });
    expect(validateAliasFormat("API")).toMatchObject({ ok: false });
  });
});

describe("destination URL validation", () => {
  it.each([
    ["https://example.com/path?q=1", true],
    ["http://example.com", true],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["ftp://example.com/file", false],
    ["not a url", false],
    ["https://user:pass@example.com", false],
    ["http://localhost:3000", false],
    ["http://127.0.0.1/admin", false],
    ["http://192.168.1.10", false],
    ["https://intranet", false],
    ["https://lp.test/abc", false], // own short domain -> loop
  ])("%s -> %s", (url, ok) => {
    expect(validateDestination(url).ok).toBe(ok);
  });
});

describe("link creation", () => {
  it("creates a link with a random code, tags and campaign", async () => {
    const c = await createCampaign(await db(), alice, { name: "Launch" });
    const t = await createTag(await db(), alice, { name: "Social" });
    const { link } = await createLink(await db(), alice, { destinationUrl: "https://example.com", campaignId: c.id, tagIds: [t.id], maxClicks: "5" });
    expect(link.shortCode).toMatch(/^[0-9a-z]{7}$/);
    expect(link.isCustomAlias).toBe(false);
    expect(link.maxClicks).toBe(5);
    expect(link.campaignId).toBe(c.id);
    expect(link.safetyStatus).toBe("not_scanned"); // no Safe Browsing key in tests
  });

  it("hashes link passwords (never stores plaintext)", async () => {
    const { link } = await createLink(await db(), alice, { destinationUrl: "https://example.com", password: "hunter22" });
    expect(link.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(link.passwordHash).not.toContain("hunter22");
  });

  it("rejects a taken alias regardless of case", async () => {
    await createLink(await db(), alice, { destinationUrl: "https://example.com", alias: "promo-2026" });
    await expect(createLink(await db(), bob, { destinationUrl: "https://example.com", alias: "PROMO-2026" })).rejects.toMatchObject({ status: 400, fields: { alias: expect.stringContaining("taken") } });
  });

  it("simultaneous creations of the same alias: exactly one succeeds (UNIQUE index)", async () => {
    const d = await db();
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => createLink(d, alice, { destinationUrl: "https://example.com", alias: "race-alias" })));
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const rows = await d.select().from(links).where(eq(links.shortCode, "race-alias"));
    expect(rows).toHaveLength(1);
  });

  it("surfaces validation errors and warnings before publishing", async () => {
    await addBlockedDomain(await db(), admin, { domain: "malware.example.org" });
    const r = await validateLinkInput(await db(), alice, {
      destinationUrl: "https://cdn.malware.example.org/x", alias: "login", expiresAt: "2020-01-01T00:00:00Z", maxClicks: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.destinationUrl).toMatch(/blocklist/);
    expect(r.errors.alias).toMatch(/reserved/);
    expect(r.errors.expiresAt).toMatch(/past/);
    expect(r.errors.maxClicks).toBeDefined();
    const w = await validateLinkInput(await db(), alice, { destinationUrl: "http://example.com", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
    expect(w.ok).toBe(true);
    expect(w.warnings.join(" ")).toMatch(/http:\/\//);
    expect(w.warnings.join(" ")).toMatch(/less than an hour/);
  });

  it("refuses campaigns and tags that belong to another user", async () => {
    const bobsCampaign = await createCampaign(await db(), bob, { name: "Bob only" });
    const bobsTag = await createTag(await db(), bob, { name: "private" });
    const r = await validateLinkInput(await db(), alice, { destinationUrl: "https://example.com", campaignId: bobsCampaign.id, tagIds: [bobsTag.id] });
    expect(r.errors.campaignId).toBeDefined();
    expect(r.errors.tagIds).toBeDefined();
  });
});

describe("ownership", () => {
  it("a user cannot read, edit or delete another user's link", async () => {
    const { link } = await createLink(await db(), alice, { destinationUrl: "https://example.com" });
    await expect(getLinkForUser(await db(), bob, link.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateLink(await db(), bob, link.id, { destinationUrl: "https://evil.example.com" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteLink(await db(), bob, link.id)).rejects.toMatchObject({ status: 404 });
    const [row] = await (await db()).select().from(links).where(eq(links.id, link.id));
    expect(row.destinationUrl).toBe("https://example.com/");
    expect(row.deletedAt).toBeNull();
  });

  it("admins can inspect any link", async () => {
    const { link } = await createLink(await db(), alice, { destinationUrl: "https://example.com" });
    await expect(getLinkForUser(await db(), admin, link.id, { allowAdmin: true })).resolves.toMatchObject({ id: link.id });
  });

  it("partial update preserves existing tags unless tagIds is explicitly supplied", async () => {
    const t1 = await createTag(await db(), alice, { name: "newsletter" });
    const t2 = await createTag(await db(), alice, { name: "promo" });
    const { link } = await createLink(await db(), alice, {
      destinationUrl: "https://example.com/tagged",
      title: "Initial Title",
      tagIds: [t1.id, t2.id],
    });

    // Update only title - tagIds omitted
    await updateLink(await db(), alice, link.id, { title: "Updated Title" });

    const d = await db();
    const tagsAfterPartial = await d.select().from(linkTags).where(eq(linkTags.linkId, link.id));
    expect(tagsAfterPartial.map((t) => t.tagId).sort()).toEqual([t1.id, t2.id].sort());

    // Explicitly clearing tags with empty array
    await updateLink(d, alice, link.id, { tagIds: [] });
    const tagsAfterClear = await d.select().from(linkTags).where(eq(linkTags.linkId, link.id));
    expect(tagsAfterClear).toHaveLength(0);
  });

  it("listTags excludes soft-deleted links from link count", async () => {
    const t = await createTag(await db(), alice, { name: "analytics-track" });
    const { link } = await createLink(await db(), alice, {
      destinationUrl: "https://example.com/to-delete",
      tagIds: [t.id],
    });

    const tagsBeforeDelete = await listTags(await db(), alice.id);
    const tagBefore = tagsBeforeDelete.find((x) => x.id === t.id);
    expect(tagBefore?.link_count).toBe(1);

    await deleteLink(await db(), alice, link.id);

    const tagsAfterDelete = await listTags(await db(), alice.id);
    const tagAfter = tagsAfterDelete.find((x) => x.id === t.id);
    expect(tagAfter?.link_count).toBe(0);
  });
});
