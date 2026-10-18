import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

export const PATCH = api(async (req) => {
  const user = await requireUser();
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(await readJson(req));
  await (await getDb()).update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
});
