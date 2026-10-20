import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { adminSetDisabled } from "@/lib/links/service";

type Ctx = { params: Promise<{ id: string }> };

/** Takedown / restore. The cache entry is deleted in the same request, so the next redirect is blocked. */
export const POST = api<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { disabled, reason } = z.object({ disabled: z.boolean(), reason: z.string().max(300).optional() }).parse(await readJson(req));
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Link not found." }, { status: 404 });
  const l = await adminSetDisabled(await getDb(), admin, id, disabled, reason);
  return NextResponse.json({ link: { id: l.id, status: l.status, disabledReason: l.disabledReason } });
});
