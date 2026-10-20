import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { links } from "@/db/schema";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { validateAliasFormat } from "@/lib/links/codes";

/** Live availability check for the wizard. The UNIQUE index still decides on submit. */
export const GET = api(async (req) => {
  await requireUser();
  const alias = new URL(req.url).searchParams.get("alias") ?? "";
  const f = validateAliasFormat(alias);
  if (!f.ok) return NextResponse.json({ available: false, alias: f.alias, reason: f.reason });
  const taken = await (await getDb()).select({ id: links.id }).from(links).where(eq(links.shortCode, f.alias)).limit(1);
  return NextResponse.json({ available: taken.length === 0, alias: f.alias, reason: taken.length ? `"${f.alias}" is already taken.` : null });
});
