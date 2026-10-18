import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { addBlockedDomain, listBlockedDomains } from "@/lib/admin/service";
import { api, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";

export const GET = api(async () => {
  await requireAdmin();
  return NextResponse.json({ domains: await listBlockedDomains(await getDb()) });
});

export const POST = api(async (req) => {
  const admin = await requireAdmin();
  const r = await addBlockedDomain(await getDb(), admin, await readJson(req));
  return NextResponse.json(r, { status: 201 });
});
