import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { blockedDomains, clickEvents, links } from "@/db/schema";
import { getLinkCache } from "@/lib/cache";
import { addBlockedDomain } from "@/lib/admin/service";
import { adminSetDisabled, createLink, deleteLink, setOwnerStatus, updateLink } from "@/lib/links/service";
import type { SessionUser } from "@/lib/auth/users";
import { CHROME_UA, db, IPHONE_UA, makeUser, visit } from "./helpers";

let owner: SessionUser;
let admin: SessionUser;

beforeAll(async () => {
  owner = await makeUser();
  admin = await makeUser("admin");
});

async function newLink(input: Record<string, unknown> = {}) {
  const { link } = await createLink(await db(), owner, { destinationUrl: "https://example.com/landing", ...input });
  return link;
}

async function events(linkId: string) {
  return (await db()).select().from(clickEvents).where(eq(clickEvents.linkId, linkId));
}

describe("redirect engine (integration)", () => {
  it("redirects with 302 and no-store semantics, and persists a click event", async () => {
    const l = await newLink({ alias: "hello-world" });
    const r = await visit("Hello-World", { headers: { referer: "https://www.instagram.com/p/1" } });
    expect(r.status).toBe(302);
    expect(r.location).toBe("https://example.com/landing");
    expect(r.outcome).toBe("redirected");
    const ev = await events(l.id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ outcome: "redirected", device: "desktop", browser: "Chrome", referrerDomain: "instagram.com", source: "link", isBot: false });
    expect(ev[0].visitorHash).toMatch(/^[0-9a-f]{32}$/);
    expect(ev[0].latencyMs).toBeGreaterThanOrEqual(0);
    const [row] = await (await db()).select().from(links).where(eq(links.id, l.id));
    expect(row.clickCount).toBe(1);
  });

  it("logs not_found for unknown codes with a null link id", async () => {
    const r = await visit("does-not-exist-123");
    expect(r.status).toBe(404);
    expect(r.outcome).toBe("not_found");
    const rows = await (await db()).select().from(clickEvents).where(eq(clickEvents.attemptedCode, "does-not-exist-123"));
    expect(rows[0]).toMatchObject({ linkId: null, outcome: "not_found" });
  });

  it("tracks QR-originated visits", async () => {
    const l = await newLink();
    await visit(l.shortCode, { qr: true, ua: IPHONE_UA });
    const [ev] = await events(l.id);
    expect(ev).toMatchObject({ source: "qr", device: "mobile", os: "iOS" });
  });

  it("blocks paused links and resumes them", async () => {
    const l = await newLink();
    await visit(l.shortCode); // warm cache
    await setOwnerStatus(await db(), owner, l.id, "paused");
    expect((await visit(l.shortCode)).outcome).toBe("paused");
    await setOwnerStatus(await db(), owner, l.id, "active");
    expect((await visit(l.shortCode)).outcome).toBe("redirected");
  });

  it("blocks expired links and keeps their analytics", async () => {
    const l = await newLink({ expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect((await visit(l.shortCode)).outcome).toBe("redirected");
    const r = await visit(l.shortCode, { now: Date.now() + 120_000 });
    expect(r.status).toBe(410);
    expect(r.outcome).toBe("expired");
    const ev = await events(l.id);
    expect(ev.map((e) => e.outcome).sort()).toEqual(["expired", "redirected"]);
  });

  it("password: form, wrong attempts never consume the cap, correct password redirects", async () => {
    const l = await newLink({ password: "s3cret!", maxClicks: 1 });
    const form = await visit(l.shortCode);
    expect(form.status).toBe(401);
    expect(form.page?.kind).toBe("password");
    expect(form.event).toBeNull();
    for (let i = 0; i < 3; i++) {
      const bad = await visit(l.shortCode, { password: "nope" });
      expect(bad.outcome).toBe("password_failed");
    }
    const [row] = await (await db()).select().from(links).where(eq(links.id, l.id));
    expect(row.clickCount).toBe(0);
    const ok = await visit(l.shortCode, { password: "s3cret!" });
    expect(ok.outcome).toBe("redirected");
    expect((await visit(l.shortCode, { password: "s3cret!" })).outcome).toBe("limit_reached");
  });

  it("click cap boundary: exactly N redirects then limit_reached", async () => {
    const l = await newLink({ maxClicks: 3 });
    const outcomes = [];
    for (let i = 0; i < 5; i++) outcomes.push((await visit(l.shortCode)).outcome);
    expect(outcomes).toEqual(["redirected", "redirected", "redirected", "limit_reached", "limit_reached"]);
  });

  it("concurrency: 50 simultaneous human requests on a cap-10 link -> exactly 10 redirected, 40 limit_reached", async () => {
    const l = await newLink({ maxClicks: 10 });
    const results = await Promise.all(Array.from({ length: 50 }, () => visit(l.shortCode)));
    const redirected = results.filter((r) => r.outcome === "redirected").length;
    const limited = results.filter((r) => r.outcome === "limit_reached").length;
    expect(redirected).toBe(10);
    expect(limited).toBe(40);
    const [row] = await (await db()).select().from(links).where(eq(links.id, l.id));
    expect(row.clickCount).toBe(10);
  });

  it("bots are redirected, logged as bot, not counted and do not use the cap", async () => {
    const l = await newLink({ maxClicks: 1 });
    const bots = [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "WhatsApp/2.23.20.0 A",
      "curl/8.4.0",
      "",
    ];
    for (const ua of bots) {
      const r = await visit(l.shortCode, { ua });
      expect(r.outcome, `UA: ${ua || "(empty)"}`).toBe("bot");
      expect(r.status).toBe(302);
    }
    const head = await visit(l.shortCode, { method: "HEAD", ua: CHROME_UA });
    expect(head.outcome).toBe("bot");
    const [row] = await (await db()).select().from(links).where(eq(links.id, l.id));
    expect(row.clickCount).toBe(0);
    expect((await visit(l.shortCode)).outcome).toBe("redirected");
  });

  it("takedown: a cached link is blocked on the very next request after admin disable", async () => {
    const l = await newLink();
    expect((await visit(l.shortCode)).outcome).toBe("redirected");
    const second = await visit(l.shortCode);
    expect(second.cache).toBe("hit"); // proves the snapshot is cached
    await adminSetDisabled(await db(), admin, l.id, true, "Phishing report");
    const blocked = await visit(l.shortCode);
    expect(blocked.outcome).toBe("disabled");
    expect(blocked.status).toBe(410);
    // History is preserved
    const ev = await events(l.id);
    expect(ev.filter((e) => e.outcome === "redirected")).toHaveLength(2);
    expect(ev.filter((e) => e.outcome === "disabled")).toHaveLength(1);
  });

  it("owner cannot re-enable an admin-disabled link", async () => {
    const l = await newLink();
    await adminSetDisabled(await db(), admin, l.id, true, "abuse");
    await expect(setOwnerStatus(await db(), owner, l.id, "active")).rejects.toThrow(/administrator/);
  });

  it("editing the destination invalidates the cache immediately", async () => {
    const l = await newLink();
    await visit(l.shortCode);
    await updateLink(await db(), owner, l.id, { destinationUrl: "https://example.org/new" });
    expect((await visit(l.shortCode)).location).toBe("https://example.org/new");
  });

  it("blocklisting a domain blocks existing cached links to it", async () => {
    const { link: l } = await createLink(await db(), owner, { destinationUrl: "https://evil-phish.example.net/login" });
    await visit(l.shortCode);
    expect(getLinkCache().driver).toBe("memory");
    await addBlockedDomain(await db(), admin, { domain: "example.net", reason: "phishing" });
    expect((await visit(l.shortCode)).outcome).toBe("disabled");
    await (await db()).delete(blockedDomains).where(eq(blockedDomains.domain, "example.net"));
  });

  it("deleted links stop redirecting but keep events", async () => {
    const l = await newLink();
    await visit(l.shortCode);
    await deleteLink(await db(), owner, l.id);
    expect((await visit(l.shortCode)).outcome).toBe("not_found");
    // The pre-delete event keeps its link_id; the post-delete visit is traceable by attempted code.
    const c = await (await db()).execute(sql`select count(*) filter (where link_id = ${l.id})::int as linked, count(*)::int as total from click_events where attempted_code = ${l.shortCode}`);
    expect(c.rows[0]).toMatchObject({ linked: 1, total: 2 });
  });

  it("targeting rules route mobile visitors", async () => {
    const { addRule } = await import("@/lib/links/service");
    const l = await newLink();
    await visit(l.shortCode);
    const rule = await addRule(await db(), owner, l.id, { conditionType: "device", conditionValue: "mobile", targetUrl: "https://m.example.com/" });
    const r = await visit(l.shortCode, { ua: IPHONE_UA });
    expect(r.location).toBe("https://m.example.com/");
    const ev = (await events(l.id)).find((e) => e.ruleId);
    expect(ev?.ruleId).toBe(rule.id);
    expect((await visit(l.shortCode)).location).toBe("https://example.com/landing");
  });
});
