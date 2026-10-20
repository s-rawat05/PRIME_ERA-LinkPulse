import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { importRows, links } from "@/db/schema";
import { addBlockedDomain } from "@/lib/admin/service";
import type { SessionUser } from "@/lib/auth/users";
import { previewImport, runImport, SAMPLE_CSV } from "@/lib/csv/import";
import { createLink } from "@/lib/links/service";
import { createCampaign } from "@/lib/org/service";
import { db, makeUser } from "./helpers";

let user: SessionUser;
beforeAll(async () => {
  user = await makeUser();
  const admin = await makeUser("admin");
  await createCampaign(await db(), user, { name: "Diwali Sale" });
  await addBlockedDomain(await db(), admin, { domain: "phish.example.net" });
});

describe("CSV import", () => {
  it("preview validates every row without writing anything", async () => {
    const before = await (await db()).select().from(links).where(eq(links.ownerId, user.id));
    const p = await previewImport(await db(), user, "sample.csv", SAMPLE_CSV);
    const after = await (await db()).select().from(links).where(eq(links.ownerId, user.id));
    expect(after.length).toBe(before.length);
    expect(p.total).toBe(9);
    expect(p.skipped).toBe(1);
    expect(p.valid).toBe(3);
    expect(p.rejected).toBe(5);
    const byAlias = Object.fromEntries(p.rows.map((r) => [r.data.alias, r]));
    expect(byAlias["broken-row"].errors.join()).toMatch(/valid absolute URL/);
    expect(byAlias["xss-try"].errors.join()).toMatch(/Unsafe scheme/);
    expect(byAlias["admin"].errors.join()).toMatch(/reserved/);
    expect(byAlias["old-promo"].errors.join()).toMatch(/past/);
    expect(p.rows.find((r) => r.data.title === "Duplicate alias in file")!.errors.join()).toMatch(/Duplicate alias "diwali-offers" in this file \(first used on row 2\)/);
  });

  it("imports only valid rows and records a row-level report", async () => {
    const csv = `${SAMPLE_CSV}https://login.phish.example.net/x,phishy,Blocked domain,,,,,\nhttps://example.com/x,,Unknown campaign,Nope,,,,\n`;
    const r = await runImport(await db(), user, "broken.csv", csv);
    expect(r.imported).toBe(3);
    expect(r.rejected).toBe(7);
    expect(r.skipped).toBe(1);
    expect(r.rows.find((x) => x.data.alias === "phishy")!.errors.join()).toMatch(/blocklist/);
    expect(r.rows.find((x) => x.data.title === "Unknown campaign")!.errors.join()).toMatch(/does not exist/);

    const d = await db();
    const imported = await d.select().from(links).where(eq(links.ownerId, user.id));
    const codes = imported.map((l) => l.shortCode);
    expect(codes).toContain("diwali-offers");
    expect(codes).toContain("vip-preview");
    for (const bad of ["broken-row", "xss-try", "admin", "old-promo", "phishy"]) expect(codes).not.toContain(bad);
    const vip = imported.find((l) => l.shortCode === "vip-preview")!;
    expect(vip.passwordHash).toMatch(/^\$2/);

    const stored = await d.select().from(importRows).where(eq(importRows.jobId, r.jobId!));
    expect(stored.filter((s) => s.status === "imported")).toHaveLength(3);
    expect(stored.filter((s) => s.status === "rejected").every((s) => s.errors.length > 0 && s.linkId === null)).toBe(true);
  });

  it("re-importing the same file rejects aliases that now exist", async () => {
    const r = await runImport(await db(), user, "again.csv", SAMPLE_CSV);
    expect(r.rows.find((x) => x.data.alias === "diwali-offers")!.errors.join()).toMatch(/taken/);
  });

  it("demo/scenario-b.csv (used in the live demo) yields 35 valid, 14 rejected, 1 skipped", async () => {
    const { readFileSync } = await import("node:fs");
    const d = await db();
    const fresh = await makeUser();
    const admin = await makeUser("admin");
    await createCampaign(d, fresh, { name: "Diwali Sale" });
    await addBlockedDomain(d, admin, { domain: "phish-example.net" });
    await createLink(d, fresh, { destinationUrl: "https://example.com/w", alias: "winter-offers" });
    const p = await previewImport(d, fresh, "scenario-b.csv", readFileSync("demo/scenario-b.csv", "utf8"));
    expect({ total: p.total, valid: p.valid, rejected: p.rejected, skipped: p.skipped }).toEqual({ total: 50, valid: 35, rejected: 14, skipped: 1 });
  });

  it("rejects files without the required column", async () => {
    await expect(previewImport(await db(), user, "bad.csv", "foo,bar\n1,2\n")).rejects.toMatchObject({ status: 400 });
  });
});
