function formatServerWideAiConfigForClient(config) {
  if (!config) {
    return null;
  }

  return {
    id: config.id,
    label: config.label,
    provider: config.provider,
    model: config.model,
    ownerUserId: config.ownerUserId,
    ownerUsername: config.ownerUsername,
    serverWide: true,
    hasApiKey: Boolean(config.apiKey),
  };
}

module.exports = {
  formatServerWideAiConfigForClient,
};
