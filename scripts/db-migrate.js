import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(rootDir, "migrations");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to run migrations");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrationIds(client) {
  await ensureMigrationsTable(client);
  const result = await client.query("SELECT id FROM schema_migrations");

  return new Set(result.rows.map((row) => row.id));
}

async function run() {
  const files = fs.readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  const client = await pool.connect();

  try {
    const applied = await appliedMigrationIds(client);

    for (const fileName of files) {
      if (applied.has(fileName)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, fileName), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
          [fileName]
        );
        await client.query("COMMIT");
        console.log(`Applied ${fileName}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
