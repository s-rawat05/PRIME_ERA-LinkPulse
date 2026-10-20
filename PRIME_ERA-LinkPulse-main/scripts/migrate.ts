
/**
 * Applies versioned SQL migrations from ./drizzle to DATABASE_URL.
 * Run using: npm run db:migrate
 * PGlite migrations are handled automatically on first connection.
 */

import "dotenv/config";
import { closeDb, getDb, MIGRATIONS_FOLDER } from "../src/db";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || "pglite:./.data/pglite";

  try {
    const db = await getDb();

    if (url.startsWith("postgres")) {
      const { migrate } = await import(
        "drizzle-orm/node-postgres/migrator"
      );

      await migrate(db as never, {
        migrationsFolder: MIGRATIONS_FOLDER,
      });
    }

    console.log(
      `Migrations applied successfully to ${
        url.startsWith("postgres") ? "Postgres" : "PGlite"
      } database.`
    );
  } finally {
    await closeDb();
  }
}

main().catch((err: unknown) => {
  console.error("Database migration failed:", err);
  process.exitCode = 1;
});
