import { Pool } from "pg";
import { migrate } from "../scripts/migrate";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://ghadi@127.0.0.1:5432/ghadi_test";
  if (!/_test\b/.test(url)) throw new Error("Refusing to reset a database whose name does not end in _test");
  const pool = new Pool({ connectionString: url });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await migrate(url);
}
