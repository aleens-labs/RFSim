const test = require("node:test");
const assert = require("node:assert/strict");

const { formatServerWideAiConfigForClient } = require("../src/aiConfigPolicy");

test("server-wide AI config payload never includes the raw API key", () => {
  const payload = formatServerWideAiConfigForClient({
    id: "cfg-server",
    label: "Shared Claude",
    provider: "anthropic",
    apiKey: "sk-ant-secret",
    model: "claude-sonnet-4-6",
    ownerUserId: "user-1",
    ownerUsername: "Admin",
  });

  assert.equal(payload.hasApiKey, true);
  assert.equal(Object.hasOwn(payload, "apiKey"), false);
  assert.deepEqual(payload, {
    id: "cfg-server",
    label: "Shared Claude",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    ownerUserId: "user-1",
    ownerUsername: "Admin",
    serverWide: true,
    hasApiKey: true,
  });
});
