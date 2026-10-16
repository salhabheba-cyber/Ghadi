import { Pool } from "pg";
import { auth } from "../src/lib/auth";

// Creates the owner's admin login once, from ADMIN_EMAIL + ADMIN_PASSWORD (env vars on the host).
// It only ever CREATES a new account: if the email is already registered it changes nothing,
// so nobody can be promoted by pre-registering. Remove ADMIN_PASSWORD from the host afterwards.
const email = process.env.ADMIN_EMAIL?.trim();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) process.exit(0);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const existing = await pool.query(`SELECT 1 FROM "user" WHERE lower(email)=lower($1)`, [email]);
  if (existing.rowCount) {
    console.log("bootstrap-admin: account already exists, nothing changed");
  } else {
    await auth.api.signUpEmail({ body: { email, password, name: "Owner" } });
    await pool.query(`UPDATE "user" SET role='admin' WHERE lower(email)=lower($1)`, [email]);
    await pool.query(`INSERT INTO audit_events (actor_id, action, metadata) VALUES (NULL,'user.role_set',$1)`, [JSON.stringify({ role: "admin", via: "bootstrap" })]);
    console.log("bootstrap-admin: admin account created");
  }
} catch (e) {
  console.error("bootstrap-admin failed:", e instanceof Error ? e.message : e);
} finally {
  await pool.end();
}
process.exit(0);
