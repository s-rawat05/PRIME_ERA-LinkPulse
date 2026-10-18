import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { simulate } from "@/lib/redirect/simulate";

export const POST = api(async (req) => {
  const user = await requireUser();
  return NextResponse.json(await simulate(await getDb(), user, await readJson(req)));
});
