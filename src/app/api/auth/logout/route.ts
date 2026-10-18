import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api } from "@/lib/api";
import { clearSessionCookie, SESSION_COOKIE } from "@/lib/auth/session";
import { deleteSession } from "@/lib/auth/users";

export const POST = api(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(await getDb(), token);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
