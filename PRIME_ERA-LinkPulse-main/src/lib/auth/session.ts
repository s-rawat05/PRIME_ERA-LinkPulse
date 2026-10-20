import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { config } from "@/lib/config";
import { forbidden, unauthorized } from "@/lib/errors";
import { userFromToken, type SessionUser } from "./users";

export const SESSION_COOKIE = "lp_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Request-deduplicated current user (null when signed out, disabled or expired). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userFromToken(await getDb(), token);
});

/** For Route Handlers: throws 401/403 AppErrors handled by the API wrapper. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw forbidden("Administrator access required.");
  return u;
}

/** For Server Components: redirects instead of throwing. */
export async function requirePageUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requirePageAdmin(): Promise<SessionUser> {
  const u = await requirePageUser();
  if (u.role !== "admin") redirect("/dashboard?denied=admin");
  return u;
}
