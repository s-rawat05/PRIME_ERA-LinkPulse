import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { links } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/users";
import { createLink } from "@/lib/links/service";
import { db, makeUser, visit } from "./helpers";

/**
 * Runs only against a real Postgres server (TEST_DATABASE_URL), where requests use separate pooled
 * connections and genuinely contend. PGlite executes on a single connection, so it cannot show this.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL?.startsWith("postgres"))("click cap under real Postgres concurrency", () => {
  let user: SessionUser;
  beforeAll(async () => {
    user = await makeUser();
  });

  it("control: a naive read-then-write cap check over-admits under the same load", async () => {
    const d = await db();
    const { link } = await createLink(d, user, { destinationUrl: "https://example.com/naive", maxClicks: 10 });
    const naive = async () => {
      const [row] = await d.select({ c: links.clickCount, m: links.maxClicks }).from(links).where(eq(links.id, link.id));
      await new Promise((r) => setTimeout(r, 5)); // realistic gap between check and write
      if (row.c >= row.m!) return false;
      await d.execute(sql`UPDATE links SET click_count = click_count + 1 WHERE id = ${link.id}`);
      return true;
    };
    const admitted = (await Promise.all(Array.from({ length: 50 }, naive))).filter(Boolean).length;
    // Proves the 50 requests overlapped: the unsafe pattern lets more than 10 through.
    expect(admitted).toBeGreaterThan(10);
  });

  it("LinkPulse: 50 simultaneous human requests on a cap-10 link -> exactly 10 redirected, 40 limit_reached", async () => {
    const { link } = await createLink(await db(), user, { destinationUrl: "https://example.com/atomic", maxClicks: 10 });
    const results = await Promise.all(Array.from({ length: 50 }, () => visit(link.shortCode)));
    expect(results.filter((r) => r.outcome === "redirected")).toHaveLength(10);
    expect(results.filter((r) => r.outcome === "limit_reached")).toHaveLength(40);
    const [row] = await (await db()).select().from(links).where(eq(links.id, link.id));
    expect(row.clickCount).toBe(10);
  });
});
