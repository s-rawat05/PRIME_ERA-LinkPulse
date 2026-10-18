import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { sessions, users, workspaces } from "@/db/schema";
import { audit } from "@/lib/audit";
import { badRequest, conflict, isUniqueViolation } from "@/lib/errors";
import { hashPassword, verifyPassword } from "./password";

export type SessionUser = { id: string; email: string; name: string; role: "user" | "admin" };

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).pipe(z.string().max(254)),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1).max(128),
});

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function registerUser(db: Db, input: unknown, role: "user" | "admin" = "user"): Promise<SessionUser> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    throw badRequest("Please fix the highlighted fields.", fields);
  }
  const { name, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    return await db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({ name, email, passwordHash, role }).returning();
      await tx.insert(workspaces).values({ name: `${name}'s workspace`, ownerId: u.id });
      await audit(tx as unknown as Db, { actorId: u.id, action: "user.register", targetType: "user", targetId: u.id, after: { email, role } });
      return { id: u.id, email: u.email, name: u.name, role: u.role };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("An account with this email already exists.", { email: "Email already registered" });
    throw err;
  }
}

/** Constant-ish time: always run bcrypt, even for unknown emails, to avoid user enumeration by timing. */
let dummyHash: Promise<string> | null = null;

export async function authenticate(db: Db, input: unknown): Promise<SessionUser | null> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return null;
  const [u] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  const ok = await verifyPassword(parsed.data.password, u?.passwordHash ?? (await dummyHash));
  if (!u || !ok || u.disabledAt) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

export async function createSession(db: Db, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: tokenHash(token), userId, expiresAt });
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  return { token, expiresAt };
}

export async function userFromToken(db: Db, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, tokenHash(token)), gt(sessions.expiresAt, new Date()), isNull(users.disabledAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, tokenHash(token)));
}

export async function changePassword(db: Db, userId: string, current: string, next: string) {
  if (next.length < 8 || next.length > 128) throw badRequest("New password must be 8–128 characters.", { next: "8–128 characters" });
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !(await verifyPassword(current, u.passwordHash))) throw badRequest("Current password is incorrect.", { current: "Incorrect password" });
  await db.update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, userId));
  await audit(db, { actorId: userId, action: "user.password_change", targetType: "user", targetId: userId });
}
