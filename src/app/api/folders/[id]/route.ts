import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteFolder } from "@/lib/org/service";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = api<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteFolder(await getDb(), user, id);
  return NextResponse.json({ ok: true });
});
