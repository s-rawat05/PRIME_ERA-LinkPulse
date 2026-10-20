import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth/session";
import { createSession, registerUser } from "@/lib/auth/users";
import { tooMany } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp, ipKey } from "@/lib/redirect/classify";

export const POST = api(async (req) => {
  if (!(await rateLimit("register", ipKey(clientIp(req.headers)))).ok) throw tooMany("Too many sign-ups from this network. Try again later.");
  const db = await getDb();
  const user = await registerUser(db, await readJson(req));
  const s = await createSession(db, user.id);
  await setSessionCookie(s.token, s.expiresAt);
  return NextResponse.json({ user }, { status: 201 });
});
