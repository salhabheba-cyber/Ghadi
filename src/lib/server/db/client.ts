/**
 * Server-side Postgres access for the school reading platform.
 *
 * Production uses a real Postgres server through DATABASE_URL (Railway's Postgres plugin provides it).
 * Tests (and an explicit local-development opt-in) use PGlite, an in-process Postgres, so the same SQL
 * and constraints run everywhere. There is deliberately NO silent fallback to browser storage or to an
 * in-memory database: without DATABASE_URL the school features report "not configured".
 */
import { migrate } from "./migrations";
import { seedCatalog } from "../books/seed";

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Runs `fn` inside one transaction; rolls back if it throws. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

export class DbNotConfiguredError extends Error {
  constructor() {
    super(
      "The school database is not configured. Set DATABASE_URL (a Postgres connection string) on the server.",
    );
    this.name = "DbNotConfiguredError";
  }
}

let instance: Promise<Db> | null = null;

export function isDbConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.DATABASE_URL) || env.GHADI_DEV_DB === "pglite";
}

async function createPg(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const ssl =
    process.env.DATABASE_SSL === "disable" || /localhost|127\.0\.0\.1|\.railway\.internal/.test(url)
      ? undefined
      : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: url, max: 10, ssl });
  const wrap = (q: {
    query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
  }): Pick<Db, "query"> => ({
    async query<T>(sql: string, params?: unknown[]) {
      const r = await q.query(sql, params);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
    },
  });
  const base: Db = {
    ...wrap(pool),
    async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inner: Db = {
          ...wrap(client),
          tx: (f) => f(inner), // nested calls share the transaction
        };
        const out = await fn(inner);
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
  return base;
}

export async function createPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  const wrap = (q: {
    query: <R>(s: string, p?: unknown[]) => Promise<{ rows: R[]; affectedRows?: number }>;
    exec?: (s: string) => Promise<{ rows: unknown[]; affectedRows?: number }[]>;
  }): Pick<Db, "query"> => ({
    async query<T>(sql: string, params?: unknown[]) {
      if (params === undefined && sql.includes(";") && q.exec) {
        // Multi-statement scripts (migrations) need the simple protocol.
        const results = await q.exec(sql);
        const last = results[results.length - 1];
        return { rows: (last?.rows ?? []) as T[], rowCount: last?.affectedRows ?? 0 };
      }
      const r = await q.query<T>(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
    },
  });
  const db: Db = {
    ...wrap(pg),
    async tx<T>(fn: (d: Db) => Promise<T>): Promise<T> {
      return pg.transaction(async (t) => {
        const inner: Db = { ...wrap(t), tx: (f) => f(inner) };
        return fn(inner);
      });
    },
  };
  return db;
}

/** Applies migrations and seeds the verified book catalog. Safe to call repeatedly. */
export async function prepareDb(db: Db): Promise<Db> {
  await migrate(db);
  await seedCatalog(db);
  return db;
}

export function getDb(): Promise<Db> {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  let created: Promise<Db>;
  if (url) created = createPg(url);
  else if (process.env.GHADI_DEV_DB === "pglite") {
    created = createPglite(process.env.GHADI_DEV_DB_DIR || "./.ghadi-dev-db");
  } else {
    return Promise.reject(new DbNotConfiguredError());
  }
  instance = created.then(prepareDb).catch((err) => {
    instance = null; // let the next request retry instead of caching a failure
    throw err;
  });
  return instance;
}

/** Test hook: use a specific (already prepared) database. */
export function __setDbForTests(db: Db | null): void {
  instance = db ? Promise.resolve(db) : null;
}
