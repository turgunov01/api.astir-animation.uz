import pg from "pg";
import { i18n } from "./utils.js";

const { Pool } = pg;
const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function parseBoolean(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return ["1", "true", "yes", "require"].includes(String(value).toLowerCase());
}

function databaseUrlInfo(databaseUrl) {
  try {
    const url = new URL(databaseUrl);

    return {
      host: url.hostname,
      sslMode: url.searchParams.get("sslmode")
    };
  } catch {
    return {
      host: "",
      sslMode: null
    };
  }
}

export function createPgPoolOptions({
  databaseUrl = process.env.DATABASE_URL,
  databaseSsl = process.env.DATABASE_SSL,
  databaseSslRejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED
} = {}) {
  const options = {
    connectionString: databaseUrl
  };
  const { host, sslMode } = databaseUrlInfo(databaseUrl);
  const explicitSsl = parseBoolean(databaseSsl);
  const useSsl = explicitSsl ?? (
    sslMode === "require"
    || sslMode === "verify-ca"
    || sslMode === "verify-full"
    || Boolean(host && !localDatabaseHosts.has(host))
  );

  if (sslMode === "disable" && explicitSsl === null) {
    return options;
  }

  if (useSsl) {
    const explicitRejectUnauthorized = parseBoolean(databaseSslRejectUnauthorized);

    options.ssl = {
      rejectUnauthorized: explicitRejectUnauthorized ?? (sslMode === "verify-ca" || sslMode === "verify-full")
    };
  }

  return options;
}

export function createLegacyDb({ databaseUrl = process.env.DATABASE_URL } = {}) {
  if (!databaseUrl) {
    return null;
  }

  const pool = new Pool(createPgPoolOptions({ databaseUrl }));

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
