/**
 * Applies versioned SQL migrations from ./drizzle to DATABASE_URL.
 *   npm run db:migrate
 * PGlite databases are also migrated automatically on first connection.
 */
import "dotenv/config";
import { closeDb, getDb, MIGRATIONS_FOLDER } from "../src/db";

async function main() {
  const url = process.env.DATABASE_URL ?? "pglite:./.data/pglite";
  const db = await getDb();
  if (url.startsWith("postgres")) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  console.log(`Migrations applied to ${url.startsWith("postgres") ? "Postgres" : "PGlite"} database.`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
