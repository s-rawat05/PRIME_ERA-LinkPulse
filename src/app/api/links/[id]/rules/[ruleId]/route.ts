import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteRule } from "@/lib/links/service";

type Ctx = { params: Promise<{ id: string; ruleId: string }> };

export const DELETE = api<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const { id, ruleId } = await ctx.params;
  await deleteRule(await getDb(), user, id, ruleId);
  return NextResponse.json({ ok: true });
});
