const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isReservedSelfRegistrationIdentity,
  isServerAiKeyManager,
  shouldGrantAdminOnSelfRegistration,
} = require("../src/adminPolicy");

test("server AI key managers are controlled by the database admin flag", () => {
  assert.equal(isServerAiKeyManager({ username: "kyle.hicks", email: "kyle.hicks@rfsim.local", is_admin: true }), true);
  assert.equal(isServerAiKeyManager({ username: "kyle.hicks", email: "kyle.hicks@rfsim.local", is_admin: false }), false);
  assert.equal(isServerAiKeyManager({ username: "operator", email: "operator@rfsim.local", is_admin: true }), true);
});

test("self-registration never grants admin", () => {
  assert.equal(shouldGrantAdminOnSelfRegistration("kyle.hicks", "kyle.hicks@rfsim.local"), false);
  assert.equal(shouldGrantAdminOnSelfRegistration("operator", "operator@rfsim.local"), false);
});

test("self-registration does not depend on hardcoded reserved identities", () => {
  assert.equal(isReservedSelfRegistrationIdentity("kyle.hicks", "kyle.hicks@rfsim.local"), false);
  assert.equal(isReservedSelfRegistrationIdentity("operator", "operator@rfsim.local"), false);
});
