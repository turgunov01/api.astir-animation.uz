import "dotenv/config";
import pg from "pg";
import { hashSecret } from "../app/lib/security.js";
import { createPgPoolOptions } from "../app/legacy/db.js";

const { Pool } = pg;

const required = ["DATABASE_URL", "SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required to seed the legacy API`);
  process.exit(1);
}

const pool = new Pool(createPgPoolOptions());

async function run() {
  const email = process.env.SUPER_ADMIN_EMAIL.toLowerCase();
  const name = process.env.SUPER_ADMIN_NAME || "Super Admin";
  const passwordHash = hashSecret(process.env.SUPER_ADMIN_PASSWORD);

  const result = await pool.query(
    `
      INSERT INTO users (email, password_hash, name, role, active)
      VALUES ($1, $2, $3, 'super_admin', true)
      ON CONFLICT (email)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        role = 'super_admin',
        active = true
      RETURNING id, email, role
    `,
    [email, passwordHash, name]
  );

  console.log(`Seeded ${result.rows[0].role} ${result.rows[0].email} (${result.rows[0].id})`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
