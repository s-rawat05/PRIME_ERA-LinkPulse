/**
 * Optional synthetic demo data. Every row it creates is flagged is_synthetic = true so dashboards
 * can label it and the "Exclude demo data" filter can remove it.
 *
 *   npm run db:seed                      # demo user + 3 campaigns + ~30 links + 30 days of events
 *   SEED_PASSWORD=... npm run db:seed    # choose the demo user's password (otherwise random, printed once)
 *
 * Re-running replaces the previous synthetic dataset for the demo user.
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb, type Db } from "../src/db";
import { blockedDomains, clickEvents, links, users } from "../src/db/schema";
import { rollupDaily } from "../src/lib/analytics/rollup";
import { registerUser, type SessionUser } from "../src/lib/auth/users";
import { audit } from "../src/lib/audit";
import { addRule, createLink } from "../src/lib/links/service";
import { createCampaign, createTag } from "../src/lib/org/service";

const DEMO_EMAIL = process.env.SEED_EMAIL ?? "demo@linkpulse.test";
const DAY = 86_400_000;

// Deterministic PRNG so the demo looks the same on every machine.
let s = 20261018;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(arr: readonly T[], weights?: number[]) => {
  if (!weights) return arr[Math.floor(rnd() * arr.length)];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < arr.length; i++) if ((r -= weights[i]) <= 0) return arr[i];
  return arr[arr.length - 1];
};

const DEVICES = [
  { device: "mobile", os: "Android", browser: "Chrome", w: 38 },
  { device: "mobile", os: "iOS", browser: "Mobile Safari", w: 22 },
  { device: "desktop", os: "Windows", browser: "Chrome", w: 18 },
  { device: "desktop", os: "Mac OS", browser: "Safari", w: 7 },
  { device: "desktop", os: "Windows", browser: "Edge", w: 6 },
  { device: "desktop", os: "Linux", browser: "Firefox", w: 3 },
  { device: "tablet", os: "iOS", browser: "Mobile Safari", w: 4 },
  { device: "tablet", os: "Android", browser: "Chrome", w: 2 },
] as const;
const REFERRERS = ["instagram.com", "whatsapp.com", "t.co", "facebook.com", "google.com", "linkedin.com", "youtube.com", null] as const;
const REF_W = [22, 18, 9, 10, 12, 6, 5, 18];
const COUNTRIES = ["IN", "IN", "IN", "IN", "US", "AE", "GB", "SG", "NP", "CA"];
const CITIES: Record<string, string[]> = { IN: ["Dehradun", "Delhi", "Mumbai", "Bengaluru", "Haldwani"], US: ["New York", "Austin"], AE: ["Dubai"], GB: ["London"], SG: ["Singapore"], NP: ["Kathmandu"], CA: ["Toronto"] };
const BOTS = ["facebookexternalhit", "WhatsApp", "Slackbot", "Googlebot", "TelegramBot", "curl"];

function latency() {
  // Log-normal-ish around 9ms with a tail, like a cached serverless redirect.
  const u = Math.max(1e-6, rnd());
  return Math.round(Math.min(220, Math.exp(2.1 + 0.55 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()))) * 100) / 100;
}

async function resetDemo(db: Db) {
  const [u] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  await db.delete(clickEvents).where(eq(clickEvents.isSynthetic, true));
  if (u) await db.delete(users).where(eq(users.id, u.id)); // cascades to links, campaigns, tags
  await db.delete(blockedDomains).where(eq(blockedDomains.domain, "phish-example.net"));
}

async function main() {
  const db = await getDb();
  await resetDemo(db);

  const generated = !process.env.SEED_PASSWORD;
  const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString("base64url");
  const user: SessionUser = await registerUser(db, { name: "Demo Marketer", email: DEMO_EMAIL, password });

  const campaigns = [
    await createCampaign(db, user, { name: "Monsoon Launch", description: "App launch across social channels", utmSource: "instagram", utmMedium: "social", utmCampaign: "monsoon_2026", startsAt: new Date(Date.now() - 40 * DAY).toISOString(), endsAt: new Date(Date.now() + 20 * DAY).toISOString() }, { synthetic: true }),
    await createCampaign(db, user, { name: "Campus Fest 2026", description: "Posters and QR codes around campus", utmSource: "print", utmMedium: "qr", utmCampaign: "fest_2026" }, { synthetic: true }),
    await createCampaign(db, user, { name: "Winter Clearance", description: "Email and WhatsApp offers", utmSource: "newsletter", utmMedium: "email", utmCampaign: "winter_2026" }, { synthetic: true }),
  ];
  const tagRows = await Promise.all(["social", "email", "print", "influencer", "mobile"].map((name) => createTag(db, user, { name })));
  const tag = (n: string) => tagRows.find((t) => t.name === n)!.id;

  type Spec = { alias: string; url: string; c?: number; tags?: string[]; weight: number; max?: number; password?: string; expiresInDays?: number; title: string };
  const specs: Spec[] = [
    { alias: "monsoon-app", url: "https://play.google.com/store/apps/details?id=com.example.monsoon", c: 0, tags: ["social", "mobile"], weight: 9, title: "App download" },
    { alias: "monsoon-reel", url: "https://www.instagram.com/p/example-reel", c: 0, tags: ["social", "influencer"], weight: 6, title: "Launch reel" },
    { alias: "monsoon-blog", url: "https://blog.example.com/monsoon-launch", c: 0, tags: ["social"], weight: 3, title: "Launch blog post" },
    { alias: "monsoon-yt", url: "https://www.youtube.com/watch?v=example", c: 0, tags: ["influencer"], weight: 4, title: "YouTube review" },
    { alias: "monsoon-ios", url: "https://apps.apple.com/app/id000000000", c: 0, tags: ["mobile"], weight: 3, title: "iOS download" },
    { alias: "fest-tickets", url: "https://tickets.example.com/campus-fest-2026", c: 1, tags: ["print"], weight: 8, title: "Fest tickets" },
    { alias: "fest-map", url: "https://maps.example.com/campus-fest", c: 1, tags: ["print"], weight: 4, title: "Venue map" },
    { alias: "fest-schedule", url: "https://example.com/fest/schedule", c: 1, tags: ["print"], weight: 5, title: "Schedule" },
    { alias: "fest-vip", url: "https://example.com/fest/vip", c: 1, tags: ["print"], weight: 2, password: "festvip", title: "VIP passes (password)" },
    { alias: "fest-early-bird", url: "https://tickets.example.com/early-bird", c: 1, tags: ["print"], weight: 3, max: 150, title: "Early bird (cap 150)" },
    { alias: "winter-offers", url: "https://store.example.com/winter", c: 2, tags: ["email"], weight: 7, title: "Winter offers" },
    { alias: "winter-flash", url: "https://store.example.com/flash", c: 2, tags: ["email"], weight: 3, max: 60, title: "Flash sale (cap 60)" },
    { alias: "winter-wa", url: "https://store.example.com/winter?ref=wa", c: 2, tags: ["social"], weight: 4, title: "WhatsApp broadcast" },
    { alias: "winter-gift", url: "https://store.example.com/gift-cards", c: 2, tags: ["email"], weight: 2, title: "Gift cards" },
    { alias: "winter-preview", url: "https://store.example.com/preview", c: 2, tags: ["email"], weight: 2, password: "preview", title: "Member preview (password)" },
    { alias: "careers", url: "https://careers.example.com/openings", tags: ["social"], weight: 3, title: "Careers page" },
    { alias: "newsletter", url: "https://example.com/newsletter", tags: ["email"], weight: 2, title: "Newsletter sign-up" },
    { alias: "portfolio", url: "https://portfolio.example.com", weight: 1, title: "Portfolio" },
    { alias: "docs-api", url: "https://docs.example.com/api", weight: 1, title: "API docs" },
    { alias: "webinar-oct", url: "https://events.example.com/webinar-october", tags: ["email"], weight: 2, expiresInDays: 9, title: "October webinar (expires soon)" },
  ];

  const created: { id: string; code: string; weight: number; kind: string }[] = [];
  for (const sp of specs) {
    const { link } = await createLink(
      db,
      user,
      {
        destinationUrl: sp.url,
        alias: sp.alias,
        title: sp.title,
        campaignId: sp.c !== undefined ? campaigns[sp.c].id : null,
        tagIds: (sp.tags ?? []).map(tag),
        maxClicks: sp.max ?? null,
        password: sp.password ?? null,
        expiresAt: sp.expiresInDays ? new Date(Date.now() + sp.expiresInDays * DAY).toISOString() : null,
      },
      { synthetic: true, skipScan: true, source: "seed" },
    );
    created.push({ id: link.id, code: link.shortCode, weight: sp.weight, kind: sp.password ? "password" : sp.max ? "capped" : "active" });
  }
  // A few random-code links
  for (let i = 0; i < 4; i++) {
    const { link } = await createLink(db, user, { destinationUrl: `https://example.com/promo/${i + 1}`, title: `Random-code promo ${i + 1}`, campaignId: campaigns[i % 3].id }, { synthetic: true, skipScan: true, source: "seed" });
    created.push({ id: link.id, code: link.shortCode, weight: 1, kind: "active" });
  }

  // Paused
  for (const alias of ["paused-promo", "paused-survey"]) {
    const { link } = await createLink(db, user, { destinationUrl: `https://example.com/${alias}`, alias, title: `${alias} (paused)`, campaignId: campaigns[2].id }, { synthetic: true, skipScan: true, source: "seed" });
    created.push({ id: link.id, code: link.shortCode, weight: 1, kind: "paused" });
  }
  // Expired (created with a future expiry, then moved into the past so validation still applies at creation)
  for (const alias of ["summer-sale", "hackathon-reg"]) {
    const { link } = await createLink(db, user, { destinationUrl: `https://example.com/${alias}`, alias, title: `${alias} (expired)`, campaignId: campaigns[0].id, expiresAt: new Date(Date.now() + DAY).toISOString(), expiredUrl: alias === "summer-sale" ? "https://example.com/offers-ended" : null }, { synthetic: true, skipScan: true, source: "seed" });
    created.push({ id: link.id, code: link.shortCode, weight: 2, kind: "expired" });
  }
  // Admin-disabled + blocklisted destination
  const { link: phish } = await createLink(db, user, { destinationUrl: "https://login.phish-example.net/verify", alias: "free-recharge", title: "Reported phishing (disabled)" }, { synthetic: true, skipScan: true, source: "seed" });
  created.push({ id: phish.id, code: phish.shortCode, weight: 3, kind: "disabled" });
  const { link: spam } = await createLink(db, user, { destinationUrl: "https://example.com/too-good", alias: "win-iphone", title: "Spam (disabled)" }, { synthetic: true, skipScan: true, source: "seed" });
  created.push({ id: spam.id, code: spam.shortCode, weight: 2, kind: "disabled" });

  // Device targeting on the app link
  await addRule(db, user, created[0].id, { conditionType: "os", conditionValue: "ios", targetUrl: "https://apps.apple.com/app/id000000000" });

  // ---- 30 days of synthetic events ----
  const now = Date.now();
  const events: (typeof clickEvents.$inferInsert)[] = [];
  const counts = new Map<string, number>();
  const visitorPool = Array.from({ length: 900 }, () => randomBytes(8).toString("hex"));
  const caps = new Map(specs.filter((x) => x.max).map((x) => [x.alias, x.max!]));
  const kindAt = (kind: string, ageDays: number) => {
    if (kind === "paused" && ageDays < 6) return "paused";
    if (kind === "expired" && ageDays < 12) return "expired";
    if (kind === "disabled" && ageDays < 4) return "disabled";
    return null;
  };

  for (const l of created) {
    for (let d = 29; d >= 0; d--) {
      const trend = 0.6 + (29 - d) / 30; // growth toward today
      const weekend = new Date(now - d * DAY).getUTCDay() % 6 === 0 ? 1.25 : 1;
      const n = Math.round(l.weight * 3.2 * trend * weekend * (0.6 + rnd() * 0.8));
      for (let i = 0; i < n; i++) {
        const at = new Date(now - d * DAY - Math.floor(rnd() * DAY * (d === 0 ? 0.5 : 1)));
        const dev = pick(DEVICES, DEVICES.map((x) => x.w));
        const country = pick(COUNTRIES);
        const isBot = rnd() < 0.08;
        const blockedOutcome = kindAt(l.kind, d);
        let outcome: (typeof clickEvents.$inferInsert)["outcome"] = isBot ? "bot" : blockedOutcome ?? "redirected";
        if (!isBot && !blockedOutcome && l.kind === "password" && rnd() < 0.15) outcome = "password_failed";
        const cap = caps.get(l.code);
        if (outcome === "redirected" && cap !== undefined) {
          if ((counts.get(l.id) ?? 0) >= cap) outcome = "limit_reached";
        }
        if (outcome === "redirected") counts.set(l.id, (counts.get(l.id) ?? 0) + 1);
        events.push({
          linkId: l.id,
          attemptedCode: l.code,
          occurredAt: at,
          outcome,
          source: l.code.startsWith("fest") ? (rnd() < 0.7 ? "qr" : "link") : rnd() < 0.12 ? "qr" : "link",
          isBot,
          referrerDomain: isBot ? null : pick(REFERRERS, REF_W),
          country,
          city: pick(CITIES[country] ?? [null as unknown as string]),
          device: isBot ? "bot" : dev.device,
          os: isBot ? null : dev.os,
          browser: isBot ? pick(BOTS) : dev.browser,
          visitorHash: createHash("sha256").update(`${pick(visitorPool)}|${l.id}|${at.toISOString().slice(0, 10)}`).digest("hex").slice(0, 32),
          latencyMs: latency(),
          isSynthetic: true,
        });
      }
    }
  }
  // A handful of unknown-code visits for the admin view
  for (let i = 0; i < 25; i++) {
    events.push({ linkId: null, attemptedCode: pick(["promo2025", "diwali", "abc1234", "wp-admin", "test"]), occurredAt: new Date(now - Math.floor(rnd() * 20 * DAY)), outcome: "not_found", source: "link", isBot: rnd() < 0.4, device: "desktop", os: "Windows", browser: "Chrome", latencyMs: latency(), isSynthetic: true });
  }
  for (let i = 0; i < events.length; i += 500) await db.insert(clickEvents).values(events.slice(i, i + 500));
  for (const [id, n] of counts) await db.update(links).set({ clickCount: n }).where(eq(links.id, id));

  // Apply final states after history was generated
  for (const l of created.filter((x) => x.kind === "paused")) await db.update(links).set({ status: "paused" }).where(eq(links.id, l.id));
  for (const l of created.filter((x) => x.kind === "expired")) await db.update(links).set({ expiresAt: new Date(now - 12 * DAY) }).where(eq(links.id, l.id));
  // Seeded takedowns are attributed to the system (actor = null), not to any real administrator.
  for (const [id, reason] of [[phish.id, "Credential phishing reported by users"], [spam.id, "Spam / prize scam"]] as const) {
    await db.update(links).set({ status: "disabled", disabledReason: reason, disabledAt: new Date(), updatedAt: new Date() }).where(eq(links.id, id));
    await audit(db, { actorId: null, action: "seed.link_disable", targetType: "link", targetId: id, after: { status: "disabled", reason } });
  }
  await db.insert(blockedDomains).values({ domain: "phish-example.net", reason: "Credential phishing (seed)" }).onConflictDoNothing();
  await rollupDaily(db, 31);

  const total = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM click_events WHERE is_synthetic`);
  console.log(`Seeded ${created.length} links, ${campaigns.length} campaigns, ${tagRows.length} tags and ${total.rows[0].n} synthetic click events.`);
  console.log(`Demo user: ${DEMO_EMAIL}`);
  if (generated) console.log(`Demo password (shown once): ${password}`);
  console.log("Tip: promote an account to admin with  npm run admin:create -- --email <email>");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
