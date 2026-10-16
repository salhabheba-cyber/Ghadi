import { Pool, type PoolClient } from "pg";

const g = globalThis as unknown as { __ghadiPool?: Pool };

export function getPool(): Pool {
  if (!g.__ghadiPool) {
    g.__ghadiPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return g.__ghadiPool;
}

export async function resetPool() {
  if (g.__ghadiPool) {
    await g.__ghadiPool.end();
    g.__ghadiPool = undefined;
  }
}

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
