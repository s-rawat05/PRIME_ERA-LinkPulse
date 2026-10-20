import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { addRule } from "@/lib/links/service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const rule = await addRule(await getDb(), user, id, await readJson(req));
  return NextResponse.json({ rule }, { status: 201 });
});
