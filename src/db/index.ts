import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/** Both node-postgres and PGlite return `{ rows }` from raw `execute`, so type it that way. */
type RowsOf<T> = { rows: T[] };
export interface RowsResultHKT extends PgQueryResultHKT {
  type: RowsOf<this["row"]>;
}
export type Db = PgDatabase<RowsResultHKT, typeof schema>;

type Holder = { db: Db; close: () => Promise<void> };
const g = globalThis as unknown as { __lpDb?: Promise<Holder> };

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/**
 * DATABASE_URL selects the driver:
 *  - postgres:// or postgresql://  -> node-postgres Pool (Neon, Supabase, local Postgres)
 *  - pglite:memory                 -> in-memory PGlite (tests)
 *  - pglite:<dir> or unset         -> file-backed PGlite (zero-install local dev)
 * PGlite is real Postgres compiled to WASM, so SQL, constraints and migrations are identical.
 */
async function connect(): Promise<Holder> {
  const url = process.env.DATABASE_URL ?? "pglite:./.data/pglite";

  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined,
    });
    const db = drizzle(pool, { schema }) as unknown as Db;
    return { db, close: () => pool.end() };
  }

  if (!url.startsWith("pglite:")) throw new Error("Unsupported DATABASE_URL scheme");
  if (process.env.VERCEL) {
    // Serverless filesystems are ephemeral/read-only: an embedded database would lose data.
    throw new Error("DATABASE_URL must be a postgres:// connection string (e.g. Neon) when deployed on Vercel.");
  }
  const target = url.slice("pglite:".length);
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let client;
  if (target === "memory") client = new PGlite();
  else {
    const dir = path.resolve(target);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.dirname(dir), { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client, { schema });
  // Local/test databases are migrated automatically; hosted Postgres uses `npm run db:migrate`.
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: db as unknown as Db, close: () => client.close() };
}

export async function getDb(): Promise<Db> {
  if (!g.__lpDb) {
    g.__lpDb = connect().catch((err) => {
      g.__lpDb = undefined;
      throw err;
    });
  }
  return (await g.__lpDb).db;
}

export async function closeDb() {
  if (!g.__lpDb) return;
  const holder = await g.__lpDb;
  g.__lpDb = undefined;
  await holder.close();
}

export { schema };
