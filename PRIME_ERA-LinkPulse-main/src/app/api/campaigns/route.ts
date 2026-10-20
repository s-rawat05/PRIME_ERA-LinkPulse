import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createCampaign, listCampaigns } from "@/lib/org/service";

export const GET = api(async () => {
  const user = await requireUser();
  return NextResponse.json({ campaigns: await listCampaigns(await getDb(), user.id) });
});

export const POST = api(async (req) => {
  const user = await requireUser();
  const campaign = await createCampaign(await getDb(), user, await readJson(req));
  return NextResponse.json({ campaign }, { status: 201 });
});
