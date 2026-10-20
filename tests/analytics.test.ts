import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { clickEvents } from "@/db/schema";
import { getBreakdown, getSummary, getTimeseries, getTopLinks, parseRange } from "@/lib/analytics/queries";
import { rollupConsistency, rollupDaily } from "@/lib/analytics/rollup";
import type { SessionUser } from "@/lib/auth/users";
import { createLink } from "@/lib/links/service";
import { createCampaign, deleteCampaign, getCampaign, listCampaigns, updateCampaign } from "@/lib/org/service";
import { simulate } from "@/lib/redirect/simulate";
import { db, IPHONE_UA, makeUser, visit } from "./helpers";

let a: SessionUser;
let b: SessionUser;
let linkA: string;
let codeA: string;

beforeAll(async () => {
  a = await makeUser();
  b = await makeUser();
  const camp = await createCampaign(await db(), a, { name: "Diwali Sale" });
  const { link } = await createLink(await db(), a, { destinationUrl: "https://example.com/a", campaignId: camp.id });
  linkA = link.id;
  codeA = link.shortCode;
  const { link: lb } = await createLink(await db(), b, { destinationUrl: "https://example.com/b" });
  await visit(codeA, { headers: { referer: "https://t.co/x" } });
  await visit(codeA, { ua: IPHONE_UA, qr: true });
  await visit(codeA, { ua: "WhatsApp/2.23" });
  await visit(lb.shortCode);
  await visit("nope-nope");
});

describe("analytics aggregation", () => {
  it("summary counts human clicks, bots, QR and uniques from persisted events, scoped by owner", async () => {
    const s = await getSummary(await db(), { ownerId: a.id }, parseRange({ range: "7d" }));
    expect(s).toMatchObject({ clicks: 2, bots: 1, qr: 1, notFound: 0 });
    expect(s.uniques).toBe(2);
    expect(s.p95).not.toBeNull();
    const sb = await getSummary(await db(), { ownerId: b.id }, parseRange({ range: "7d" }));
    expect(sb.clicks).toBe(1);
    const platform = await getSummary(await db(), {}, parseRange({ range: "7d" }));
    expect(platform.clicks).toBe(3);
    expect(platform.notFound).toBe(1);
  });

  it("totals equal raw event counts", async () => {
    const raw = await (await db()).select().from(clickEvents).where(eq(clickEvents.linkId, linkA));
    const s = await getSummary(await db(), { linkId: linkA }, parseRange({ range: "30d" }));
    expect(s.total).toBe(raw.length);
    expect(s.clicks).toBe(raw.filter((e) => e.outcome === "redirected").length);
  });

  it("timeseries is zero-filled and sums to the summary", async () => {
    const range = parseRange({ range: "7d" });
    const ts = await getTimeseries(await db(), { ownerId: a.id }, range);
    expect(ts).toHaveLength(7);
    expect(ts.reduce((n, p) => n + p.clicks, 0)).toBe(2);
    expect(ts[ts.length - 1].day).toBe(new Date().toISOString().slice(0, 10));
  });

  it("breakdowns by referrer, device, source", async () => {
    const r = parseRange({ range: "7d" });
    expect(await getBreakdown(await db(), { ownerId: a.id }, r, "referrer")).toEqual(expect.arrayContaining([{ label: "t.co", value: 1 }]));
    expect(await getBreakdown(await db(), { ownerId: a.id }, r, "device")).toEqual(expect.arrayContaining([{ label: "mobile", value: 1 }, { label: "desktop", value: 1 }]));
    expect(await getBreakdown(await db(), { ownerId: a.id }, r, "source")).toEqual(expect.arrayContaining([{ label: "qr", value: 1 }]));
    const top = await getTopLinks(await db(), { ownerId: a.id }, r);
    expect(top[0]).toMatchObject({ short_code: codeA, clicks: 2 });
  });

  it("empty ranges return zeros, not errors", async () => {
    const r = parseRange({ from: "2020-01-01", to: "2020-01-03" });
    const s = await getSummary(await db(), { ownerId: a.id }, r);
    expect(s.clicks).toBe(0);
    expect(s.p95).toBeNull();
    expect(await getTimeseries(await db(), { ownerId: a.id }, r)).toHaveLength(3);
  });

  it("campaign metrics come from real events", async () => {
    const [c] = await listCampaigns(await db(), a.id);
    expect(c).toMatchObject({ name: "Diwali Sale", link_count: 1, clicks: 2, qr_clicks: 1, top_code: codeA });
  });

  it("campaign analytics scoped by campaignId aggregates events without requiring ownerId match", async () => {
    const [c] = await listCampaigns(await db(), a.id);
    const s = await getSummary(await db(), { campaignId: c.id }, parseRange({ range: "7d" }));
    expect(s.clicks).toBe(2);
    expect(s.qr).toBe(1);
  });

  it("daily rollups match raw counts", async () => {
    await rollupDaily(await db(), 2);
    const r = await rollupConsistency(await db(), 2);
    expect(r.consistent).toBe(true);
    expect(r.raw).toBe(3);
  });

  it("simulator uses the engine but never writes events", async () => {
    const d = await db();
    const before = (await d.select().from(clickEvents)).length;
    const sim = await simulate(d, a, { linkId: linkA, device: "mobile", country: "IN", password: "wrong", statusOverride: "paused" });
    expect(sim.simulated).toBe(true);
    expect(sim.decision.outcome).toBe("paused");
    expect(sim.steps.find((s) => s.result === "block")?.n).toBe(3);
    expect((await d.select().from(clickEvents)).length).toBe(before);
    await expect(simulate(d, b, { linkId: linkA })).rejects.toMatchObject({ status: 404 });
  });
});

describe("campaign ownership", () => {
  it("other users cannot read, update or delete a campaign", async () => {
    const c = await createCampaign(await db(), a, { name: "Owned" });
    await expect(getCampaign(await db(), b, c.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateCampaign(await db(), b, c.id, { name: "Hijack" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteCampaign(await db(), b, c.id)).rejects.toMatchObject({ status: 404 });
    expect((await listCampaigns(await db(), b.id)).map((x) => x.name)).not.toContain("Owned");
  });

  it("duplicate campaign names per owner are rejected", async () => {
    await expect(createCampaign(await db(), a, { name: "Diwali Sale" })).rejects.toMatchObject({ status: 409 });
    await expect(createCampaign(await db(), b, { name: "Diwali Sale" })).resolves.toBeTruthy();
  });

  it("enforces startsAt < endsAt on updates", async () => {
    const c = await createCampaign(await db(), a, {
      name: "Dated Campaign",
      startsAt: "2026-05-01T00:00:00Z",
      endsAt: "2026-05-10T00:00:00Z",
    });

    // Updating startsAt past existing endsAt
    await expect(updateCampaign(await db(), a, c.id, { startsAt: "2026-05-15T00:00:00Z" })).rejects.toMatchObject({
      status: 400,
      fields: { endsAt: "Must be after start" },
    });

    // Updating endsAt before existing startsAt
    await expect(updateCampaign(await db(), a, c.id, { endsAt: "2026-04-20T00:00:00Z" })).rejects.toMatchObject({
      status: 400,
      fields: { endsAt: "Must be after start" },
    });

    // Updating both with inverted dates
    await expect(
      updateCampaign(await db(), a, c.id, {
        startsAt: "2026-06-10T00:00:00Z",
        endsAt: "2026-06-01T00:00:00Z",
      }),
    ).rejects.toMatchObject({
      status: 400,
      fields: { endsAt: "Must be after start" },
    });

    // Valid update
    const updated = await updateCampaign(await db(), a, c.id, { startsAt: "2026-05-05T00:00:00Z" });
    expect(updated.startsAt?.toISOString()).toBe(new Date("2026-05-05T00:00:00Z").toISOString());
  });
});
