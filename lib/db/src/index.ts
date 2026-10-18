import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

// Idle connections get killed by managed Postgres proxies (Supabase included).
// Without this handler the FIRST such death crashes the entire Node process
// via an unhandled 'error' event. The pool drops the dead client and carries on.
pool.on("error", (err) => {
  console.error("[db] pool client error (recovered):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
