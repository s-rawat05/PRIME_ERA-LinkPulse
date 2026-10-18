import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setOwnerStatus } from "@/lib/links/service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { status } = z.object({ status: z.enum(["active", "paused"]) }).parse(await readJson(req));
  const l = await setOwnerStatus(await getDb(), user, id, status);
  return NextResponse.json({ status: l.status });
});
