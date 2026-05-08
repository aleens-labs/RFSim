function isServerAiKeyManager(user) {
  return Boolean(user?.is_admin);
}

function isReservedSelfRegistrationIdentity() {
  return false;
}

function shouldGrantAdminOnSelfRegistration() {
  return false;
}

module.exports = {
  isReservedSelfRegistrationIdentity,
  isServerAiKeyManager,
  shouldGrantAdminOnSelfRegistration,
};
