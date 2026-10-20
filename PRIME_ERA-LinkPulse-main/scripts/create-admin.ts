/**
 * Safe administrator initialisation (no hard-coded passwords).
 *
 *   npm run admin:create -- --email you@example.com [--name "Your Name"]
 *
 * - If the account exists, it is promoted to admin (password unchanged).
 * - Otherwise it is created with the password from ADMIN_PASSWORD, or a strong random password
 *   that is printed exactly once to this terminal. Change it after first sign-in.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import { users } from "../src/db/schema";
import { audit } from "../src/lib/audit";
import { registerUser } from "../src/lib/auth/users";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run admin:create -- --email you@example.com [--name "Name"]');
  const db = await getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await db.update(users).set({ role: "admin", updatedAt: new Date() }).where(eq(users.id, existing.id));
    await audit(db, { actorId: null, action: "admin.bootstrap_promote", targetType: "user", targetId: existing.id, after: { email, role: "admin" } });
    console.log(`Promoted existing user ${email} to admin.`);
  } else {
    const generated = !process.env.ADMIN_PASSWORD;
    const password = process.env.ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");
    const u = await registerUser(db, { name: arg("name") ?? "Administrator", email, password }, "admin");
    await audit(db, { actorId: null, action: "admin.bootstrap_create", targetType: "user", targetId: u.id, after: { email, role: "admin" } });
    console.log(`Created admin ${email}.`);
    if (generated) console.log(`Temporary password (shown once, change it after signing in): ${password}`);
  }
  await closeDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeDb();
  process.exit(1);
});
