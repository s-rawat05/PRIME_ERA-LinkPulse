import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { changePassword } from "@/lib/auth/users";

export const POST = api(async (req) => {
  const user = await requireUser();
  const { current, next } = z.object({ current: z.string().max(128), next: z.string().max(128) }).parse(await readJson(req));
  await changePassword(await getDb(), user.id, current, next);
  return NextResponse.json({ ok: true });
});
