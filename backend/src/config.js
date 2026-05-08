const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

function getEnv(env, name, fallback = "") {
  return env[name] ?? fallback;
}

function requireEnv(env, name, fallback = "") {
  const value = env[name] ?? fallback;
  if (value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseIntegerEnv(env, name, fallback, { min = 0 } = {}) {
  const raw = getEnv(env, name, String(fallback));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Environment variable ${name} must be an integer >= ${min}.`);
  }
  return value;
}

function loadConfig(env = process.env) {
  const nodeEnv = getEnv(env, "NODE_ENV", "development");
  const isProduction = nodeEnv === "production";
  const jwtSecret = isProduction
    ? requireEnv(env, "JWT_SECRET")
    : getEnv(env, "JWT_SECRET", "dev-only-change-me");
  const aiConfigSecret = isProduction
    ? requireEnv(env, "AI_CONFIG_SECRET")
    : getEnv(env, "AI_CONFIG_SECRET", jwtSecret);

  if (isProduction && aiConfigSecret === jwtSecret) {
    throw new Error("AI_CONFIG_SECRET must be set independently from JWT_SECRET in production.");
  }

  return {
    port: parseIntegerEnv(env, "PORT", 3000, { min: 1 }),
    appOrigin: getEnv(env, "APP_ORIGIN", "http://localhost:8080"),
    jwtSecret,
    databaseUrl: isProduction
      ? requireEnv(env, "DATABASE_URL")
      : getEnv(env, "DATABASE_URL", "postgres://postgres:postgres@localhost:5432/ew_sim"),
    aiConfigSecret,
    nodeEnv,
    isProduction,
    databaseSsl: getEnv(env, "DATABASE_SSL", "false").toLowerCase() === "true",
    databaseSslRejectUnauthorized: getEnv(
      env,
      "DATABASE_SSL_REJECT_UNAUTHORIZED",
      isProduction ? "true" : "false"
    ).toLowerCase() === "true",
    databasePoolMax: parseIntegerEnv(env, "DATABASE_POOL_MAX", 10, { min: 1 }),
    databaseIdleTimeoutMs: parseIntegerEnv(env, "DATABASE_IDLE_TIMEOUT_MS", 30000, { min: 1 }),
    databaseConnectionTimeoutMs: parseIntegerEnv(env, "DATABASE_CONNECTION_TIMEOUT_MS", 10000, { min: 1 }),
    databaseStatementTimeoutMs: parseIntegerEnv(env, "DATABASE_STATEMENT_TIMEOUT_MS", 15000, { min: 1 }),
    databaseIdleTransactionTimeoutMs: parseIntegerEnv(
      env,
      "DATABASE_IDLE_TRANSACTION_TIMEOUT_MS",
      10000,
      { min: 1 }
    ),
    analyticsRetentionDays: parseIntegerEnv(env, "ANALYTICS_RETENTION_DAYS", 180, { min: 0 }),
    analyticsPruneIntervalMs: parseIntegerEnv(env, "ANALYTICS_PRUNE_INTERVAL_MS", 21600000, { min: 0 }),
    allowUnsafeTakHosts: getEnv(env, "TAK_ALLOW_UNSAFE_HOSTS", isProduction ? "false" : "true").toLowerCase() === "true",
  };
}

const config = loadConfig();

module.exports = { config, loadConfig };
