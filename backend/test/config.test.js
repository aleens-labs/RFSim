const test = require("node:test");
const assert = require("node:assert/strict");

const { loadConfig } = require("../src/config");

test("production config requires a dedicated AI_CONFIG_SECRET", () => {
  assert.throws(() => loadConfig({
    NODE_ENV: "production",
    PORT: "3000",
    APP_ORIGIN: "https://example.test",
    DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    JWT_SECRET: "same-secret",
    AI_CONFIG_SECRET: "same-secret",
  }), /AI_CONFIG_SECRET must be set independently/);
});

test("development config can fall back to JWT_SECRET for local convenience", () => {
  const config = loadConfig({
    NODE_ENV: "development",
    PORT: "3000",
    JWT_SECRET: "dev-secret",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/ew_sim",
  });

  assert.equal(config.aiConfigSecret, "dev-secret");
  assert.equal(config.databasePoolMax, 10);
  assert.equal(config.allowUnsafeTakHosts, true);
});

test("production config blocks unsafe TAK hosts by default", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    PORT: "3000",
    APP_ORIGIN: "https://example.test",
    DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    JWT_SECRET: "jwt-secret",
    AI_CONFIG_SECRET: "ai-config-secret",
  });

  assert.equal(config.allowUnsafeTakHosts, false);
});

test("production config can explicitly allow private TAK hosts", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    PORT: "3000",
    APP_ORIGIN: "https://example.test",
    DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    JWT_SECRET: "jwt-secret",
    AI_CONFIG_SECRET: "ai-config-secret",
    TAK_ALLOW_UNSAFE_HOSTS: "true",
  });

  assert.equal(config.allowUnsafeTakHosts, true);
});
