/**
 * When TEST_DATABASE_URL points at a real Postgres server, apply migrations once before the run.
 * (PGlite test databases are created and migrated per test file automatically.)
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url?.startsWith("postgres")) return;
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
