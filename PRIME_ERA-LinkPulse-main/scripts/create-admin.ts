
/**
 * Safely initializes an administrator account without hard-coded passwords.
 *
 * Usage:
 * npm run admin:create -- --email you@example.com [--name "Your Name"]
 *
 * - Existing users are promoted to admin without changing their password.
 * - New users receive ADMIN_PASSWORD or a randomly generated password.
 * - A generated password is printed only once to the terminal.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import { users } from "../src/db/schema";
import { audit } from "../src/lib/audit";
import { registerUser } from "../src/lib/auth/users";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const email = arg("email")?.trim().toLowerCase();

  if (!email) {
    throw new Error(
      'Usage: npm run admin:create -- --email you@example.com [--name "Name"]'
    );
  }

  try {
    const db = await getDb();

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      await db
        .update(users)
        .set({
          role: "admin",
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));

      await audit(db, {
        actorId: null,
        action: "admin.bootstrap_promote",
        targetType: "user",
        targetId: existing.id,
        after: { email, role: "admin" },
      });

      console.log(`Promoted existing user ${email} to admin.`);
    } else {
      const generated = !process.env.ADMIN_PASSWORD;
      const password =
        process.env.ADMIN_PASSWORD ??
        randomBytes(12).toString("base64url");

      const user = await registerUser(
        db,
        {
          name: arg("name") ?? "Administrator",
          email,
          password,
        },
        "admin"
      );

      await audit(db, {
        actorId: null,
        action: "admin.bootstrap_create",
        targetType: "user",
        targetId: user.id,
        after: { email, role: "admin" },
      });

      console.log(`Created admin ${email}.`);

      if (generated) {
        console.log(
          `Temporary password (shown once; change after signing in): ${password}`
        );
      }
    }
  } finally {
    await closeDb();
  }
}

main().catch((err: unknown) => {
  console.error(
    "Admin initialization failed:",
    err instanceof Error ? err.message : err
  );
  process.exitCode = 1;
});
