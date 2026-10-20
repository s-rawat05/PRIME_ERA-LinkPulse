import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { registerUser, type SessionUser } from "@/lib/auth/users";
import { handleRedirect, recordClick } from "@/lib/redirect/resolve";

export const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
export const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export async function db() {
  return getDb();
}

export async function makeUser(role: "user" | "admin" = "user"): Promise<SessionUser> {
  return registerUser(await getDb(), { name: "Test User", email: `u-${randomUUID()}@example.com`, password: "password123" }, role);
}

export function headers(ua = CHROME_UA, extra: Record<string, string> = {}) {
  return new Headers({ "user-agent": ua, "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250)}`, ...extra });
}

/** Simulates a full visit: decision + synchronous persistence of the event (what after() does in production). */
export async function visit(code: string, opts: { ua?: string; method?: string; password?: string | null; qr?: boolean; headers?: Record<string, string>; now?: number } = {}) {
  const d = await getDb();
  const r = await handleRedirect(d, {
    code,
    method: opts.method ?? (opts.password != null ? "POST" : "GET"),
    headers: headers(opts.ua, opts.headers),
    searchParams: new URLSearchParams(opts.qr ? "s=qr" : ""),
    password: opts.password,
    now: opts.now,
  });
  await recordClick(d, r);
  return r;
}
