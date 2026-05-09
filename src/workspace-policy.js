(function initRfSimWorkspacePolicy(globalScope) {
  function normalizeProjects(projects) {
    return Array.isArray(projects) ? projects.filter((project) => project && typeof project.id === "string" && project.id) : [];
  }

  function isServerProjectActive(activeProjectId) {
    return typeof activeProjectId === "string" && activeProjectId.trim().length > 0;
  }

  function shouldPersistLocalMapState(activeProjectId) {
    return !isServerProjectActive(activeProjectId);
  }

  function shouldHydrateLocalMapState({ hasSessionToken = false, activeProjectId = null } = {}) {
    return !hasSessionToken || !isServerProjectActive(activeProjectId);
  }

  function resolveActiveProjectId({
    projects = [],
    requestedProjectId = null,
    preferServerProject = false,
    allowLocalMode = true,
  } = {}) {
    const normalizedProjects = normalizeProjects(projects);
    if (!normalizedProjects.length) {
      return null;
    }

    const normalizedRequestedId = typeof requestedProjectId === "string" && requestedProjectId.trim()
      ? requestedProjectId.trim()
      : null;
    if (normalizedRequestedId && normalizedProjects.some((project) => project.id === normalizedRequestedId)) {
      return normalizedRequestedId;
    }

    if (!preferServerProject && allowLocalMode) {
      return null;
    }

    return normalizedProjects[0].id;
  }

  const api = {
    isServerProjectActive,
    resolveActiveProjectId,
    shouldHydrateLocalMapState,
    shouldPersistLocalMapState,
  };

  globalScope.RfSimWorkspacePolicy = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
