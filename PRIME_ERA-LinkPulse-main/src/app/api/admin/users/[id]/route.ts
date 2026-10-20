import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { updateUser } from "@/lib/admin/service";
import { api, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const u = await updateUser(await getDb(), admin, id, await readJson(req));
  return NextResponse.json({ user: { id: u.id, role: u.role, disabledAt: u.disabledAt } });
});
