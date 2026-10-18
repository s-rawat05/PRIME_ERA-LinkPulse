import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getBreakdown, getRecentEvents, getSummary, getTimeseries, parseRange, type Scope } from "@/lib/analytics/queries";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getLinkForUser } from "@/lib/links/service";
import { getCampaign } from "@/lib/org/service";

/** JSON analytics for live refresh. Users are always scoped to their own links; `scope=platform` is admin-only. */
export const GET = api(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const db = await getDb();
  const range = parseRange({ range: p.get("range") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined });
  const scope: Scope = { includeSynthetic: p.get("real") !== "1" };
  if (!(p.get("scope") === "platform" && user.role === "admin")) scope.ownerId = user.id;
  const linkId = p.get("link");
  if (linkId) scope.linkId = (await getLinkForUser(db, user, linkId, { allowAdmin: true })).id;
  const campaignId = p.get("campaign");
  if (campaignId) scope.campaignId = (await getCampaign(db, user, campaignId)).id;
  if (scope.linkId && user.role === "admin") delete scope.ownerId;

  const [summary, series, referrers, devices, browsers, recent] = await Promise.all([
    getSummary(db, scope, range),
    getTimeseries(db, scope, range),
    getBreakdown(db, scope, range, "referrer"),
    getBreakdown(db, scope, range, "device"),
    getBreakdown(db, scope, range, "browser"),
    getRecentEvents(db, scope, 10),
  ]);
  return NextResponse.json({ range: { from: range.from, to: range.to, key: range.key }, summary, series, referrers, devices, browsers, recent, generatedAt: new Date().toISOString() });
});
