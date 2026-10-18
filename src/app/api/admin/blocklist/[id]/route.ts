import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { removeBlockedDomain } from "@/lib/admin/service";
import { api } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = api<Ctx>(async (_req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  await removeBlockedDomain(await getDb(), admin, id);
  return NextResponse.json({ ok: true });
});
