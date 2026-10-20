import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { shortUrl } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { createLink, listLinks } from "@/lib/links/service";
import { rateLimit } from "@/lib/ratelimit";

export const GET = api(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const rows = await listLinks(await getDb(), { ownerId: user.id }, {
    q: p.get("q") ?? undefined, status: p.get("status") ?? undefined, campaignId: p.get("campaign") ?? undefined, tagId: p.get("tag") ?? undefined,
  });
  return NextResponse.json({
    links: rows.map((r) => ({ ...r.link, passwordHash: undefined, hasPassword: !!r.link.passwordHash, shortUrl: shortUrl(r.link.shortCode), campaignName: r.campaignName, humanClicks: r.humanClicks, tags: r.tags })),
  });
});

export const POST = api(async (req) => {
  const user = await requireUser();
  const rl = await rateLimit("create_link", user.id);
  if (!rl.ok) throw tooMany("You are creating links too quickly. Please wait a minute.");
  const { link, warnings, scan } = await createLink(await getDb(), user, await readJson(req));
  return NextResponse.json(
    { link: { id: link.id, shortCode: link.shortCode, shortUrl: shortUrl(link.shortCode), destinationUrl: link.destinationUrl }, warnings, scan },
    { status: 201 },
  );
});
