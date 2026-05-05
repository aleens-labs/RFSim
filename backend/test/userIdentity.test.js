const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLoginIdentifierCandidates,
  normalizeUsername,
  usernameToInternalEmail,
} = require("../src/userIdentity");

test("normalizeUsername trims and lowercases usernames", () => {
  assert.equal(normalizeUsername("  Alice.Operator  "), "alice.operator");
});

test("usernameToInternalEmail creates a stable internal email", () => {
  assert.equal(usernameToInternalEmail("Alice Operator"), "alice-operator@rfsim.local");
});

test("buildLoginIdentifierCandidates includes username and internal-email forms", () => {
  assert.deepEqual(
    buildLoginIdentifierCandidates("Alice.Operator"),
    ["alice.operator", "alice.operator@rfsim.local"]
  );
});

test("buildLoginIdentifierCandidates accepts email input and resolves its local-part", () => {
  assert.deepEqual(
    buildLoginIdentifierCandidates("Alice.Operator@example.com"),
    [
      "alice.operator@example.com",
      "alice.operator-example.com@rfsim.local",
      "alice.operator",
      "alice.operator@rfsim.local",
    ]
  );
});
