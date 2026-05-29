import pg from "pg";
import { i18n } from "./utils.js";

const { Pool } = pg;

export function createLegacyDb({ databaseUrl = process.env.DATABASE_URL } = {}) {
  if (!databaseUrl) {
    return null;
  }

  const pool = new Pool({
    connectionString: databaseUrl
  });

  return {
    pool,

    query(text, params = []) {
      return pool.query(text, params);
    },

    async one(text, params = []) {
      const result = await pool.query(text, params);
      return result.rows[0] || null;
    },

    async many(text, params = []) {
      const result = await pool.query(text, params);
      return result.rows;
    },

    async transaction(work) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    close() {
      return pool.end();
    }
  };
}

export function requireLegacyDb(db) {
  return (request, response, next) => {
    if (!db) {
      response.status(503).json({
        error: "database_unavailable",
        message: i18n("DATABASE_URL is required for the legacy API")
      });
      return;
    }

    request.legacyDb = db;
    next();
  };
}
