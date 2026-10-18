import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteLink, updateLink } from "@/lib/links/service";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { link, warnings } = await updateLink(await getDb(), user, id, await readJson(req));
  return NextResponse.json({ link: { id: link.id, shortCode: link.shortCode }, warnings });
});

export const DELETE = api<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteLink(await getDb(), user, id);
  return NextResponse.json({ ok: true });
});
