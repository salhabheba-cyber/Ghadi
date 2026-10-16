import { Pool } from "pg";

// Usage: pnpm user:role <email> <parent|content_editor|admin>
// Roles are granted only from the server shell, never from the web UI.
const [email, role] = process.argv.slice(2);
if (!email || !["parent", "content_editor", "admin"].includes(role ?? "")) {
  console.error("usage: pnpm user:role <email> <parent|content_editor|admin>");
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(`UPDATE "user" SET role=$2 WHERE lower(email)=lower($1)`, [email, role]);
if (r.rowCount === 0) {
  console.error("no user with that email");
  process.exitCode = 1;
} else {
  await pool.query(`INSERT INTO audit_events (actor_id, action, metadata) VALUES (NULL,'user.role_set',$1)`, [JSON.stringify({ role })]);
  console.log(`role of ${email} is now ${role}`);
}
await pool.end();
