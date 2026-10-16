import { Pool } from "pg";
import { seedCurriculum } from "../src/lib/seed/seed";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
seedCurriculum(pool)
  .then((r) => console.log(`Seed complete: ${r.lessonsAdded} lesson(s) added`))
  .finally(() => pool.end());
