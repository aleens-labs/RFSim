const test = require("node:test");
const assert = require("node:assert/strict");

const workspacePolicy = require("../src/workspace-policy.js");

test("shouldPersistLocalMapState only in local workspace mode", () => {
  assert.equal(workspacePolicy.shouldPersistLocalMapState(null), true);
  assert.equal(workspacePolicy.shouldPersistLocalMapState("project-123"), false);
});

test("shouldHydrateLocalMapState ignores browser-local project content for active server projects", () => {
  assert.equal(workspacePolicy.shouldHydrateLocalMapState({ hasSessionToken: false, activeProjectId: null }), true);
  assert.equal(workspacePolicy.shouldHydrateLocalMapState({ hasSessionToken: true, activeProjectId: null }), true);
  assert.equal(workspacePolicy.shouldHydrateLocalMapState({ hasSessionToken: true, activeProjectId: "project-123" }), false);
});

test("resolveActiveProjectId preserves a valid explicit project selection", () => {
  const projects = [{ id: "a" }, { id: "b" }];
  assert.equal(workspacePolicy.resolveActiveProjectId({
    projects,
    requestedProjectId: "b",
    preferServerProject: true,
  }), "b");
});

test("resolveActiveProjectId prefers the newest available project when local mode is not pinned", () => {
  const projects = [{ id: "recent" }, { id: "older" }];
  assert.equal(workspacePolicy.resolveActiveProjectId({
    projects,
    requestedProjectId: null,
    preferServerProject: true,
  }), "recent");
});

test("resolveActiveProjectId honors explicit local mode when allowed", () => {
  const projects = [{ id: "recent" }];
  assert.equal(workspacePolicy.resolveActiveProjectId({
    projects,
    requestedProjectId: null,
    preferServerProject: false,
    allowLocalMode: true,
  }), null);
});
