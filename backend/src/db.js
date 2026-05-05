const { Pool } = require("pg");
const { config } = require("./config");

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
  idleTimeoutMillis: config.databaseIdleTimeoutMs,
  connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
  statement_timeout: config.databaseStatementTimeoutMs,
  idle_in_transaction_session_timeout: config.databaseIdleTransactionTimeoutMs,
  application_name: "ew-sim-api",
  ssl: config.databaseSsl
    ? { rejectUnauthorized: config.databaseSslRejectUnauthorized }
    : false
});

async function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = { pool, query };
