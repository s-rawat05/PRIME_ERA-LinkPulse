import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { setSessionCookie } from "@/lib/auth/session";
import { authenticate, createSession } from "@/lib/auth/users";
import { AppError, tooMany } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp, ipKey } from "@/lib/redirect/classify";

export const POST = api(async (req) => {
  if (!(await rateLimit("login", ipKey(clientIp(req.headers)))).ok) throw tooMany("Too many sign-in attempts. Please wait a few minutes.");
  const db = await getDb();
  const user = await authenticate(db, await readJson(req));
  if (!user) throw new AppError(401, "invalid_credentials", "Incorrect email or password.");
  const s = await createSession(db, user.id);
  await setSessionCookie(s.token, s.expiresAt);
  await audit(db, { actorId: user.id, action: "user.login", targetType: "user", targetId: user.id });
  return NextResponse.json({ user });
});
