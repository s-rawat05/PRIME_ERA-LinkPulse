import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteCampaign, updateCampaign } from "@/lib/org/service";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return NextResponse.json({ campaign: await updateCampaign(await getDb(), user, id, await readJson(req)) });
});

export const DELETE = api<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteCampaign(await getDb(), user, id);
  return NextResponse.json({ ok: true });
});
