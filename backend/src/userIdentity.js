function normalizeUsername(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeDisplayName(value = "") {
  return String(value).trim();
}

function usernameToInternalEmail(username) {
  const slug = normalizeUsername(username)
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "user";
  return `${slug}@rfsim.local`;
}

function buildLoginIdentifierCandidates(identifier) {
  const trimmed = String(identifier || "").trim();
  if (!trimmed) {
    return [];
  }

  const normalized = normalizeUsername(trimmed);
  const candidates = new Set([normalized, usernameToInternalEmail(trimmed).toLowerCase()]);
  const atIndex = normalized.indexOf("@");
  if (atIndex > 0) {
    const localPart = normalized.slice(0, atIndex).trim();
    if (localPart) {
      candidates.add(localPart);
      candidates.add(usernameToInternalEmail(localPart).toLowerCase());
    }
  }

  return [...candidates];
}

module.exports = {
  buildLoginIdentifierCandidates,
  normalizeDisplayName,
  normalizeUsername,
  usernameToInternalEmail,
};
