const test = require("node:test");
const assert = require("node:assert/strict");

const { projectCreateSchema, projectUpdateSchema } = require("../src/schemas");

test("projectCreateSchema accepts project state without a revision", () => {
  const parsed = projectCreateSchema.safeParse({
    name: "Test Project",
    description: "demo",
    state: { foo: "bar" },
  });

  assert.equal(parsed.success, true);
});

test("projectUpdateSchema requires a revision", () => {
  const parsed = projectUpdateSchema.safeParse({
    state: { foo: "bar" },
  });

  assert.equal(parsed.success, false);
  assert.match(JSON.stringify(parsed.error.flatten()), /revision/);
});

test("projectUpdateSchema accepts optimistic-lock payloads", () => {
  const parsed = projectUpdateSchema.safeParse({
    revision: 4,
    state: { foo: "bar" },
    schemaVersion: 7,
    clientSavedAt: "2026-05-05T19:00:00.000Z",
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.revision, 4);
});
