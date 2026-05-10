(function initRfSimSensorEvaluation(globalScope) {
  const DEFAULT_SENSOR_SENSITIVITY_DBM = -105;
  const DEFAULT_SENSOR_SYSTEM_LOSS_DB = 2;
  const DEFAULT_EMITTER_POWER_W = 5;
  const DEFAULT_EMITTER_BANDWIDTH_MHZ = 0.025;
  const DEMOD_MARGIN_DB = 6;

  function asFiniteNumber(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function splitWords(value) {
    if (Array.isArray(value)) return value.flatMap(splitWords);
    return String(value || "")
      .split(/[,\s;/|]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function normalizeTag(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-")
      .replace(/\s+/g, "-");
  }

  function upperText(...parts) {
    return parts
      .flat()
      .filter((part) => part !== null && part !== undefined)
      .map((part) => Array.isArray(part) ? part.join(" ") : String(part))
      .join(" ")
      .toUpperCase();
  }

  function hasAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function addTag(tags, tag) {
    const normalized = normalizeTag(tag);
    if (normalized) tags.add(normalized);
  }

  function deriveReceiveModeTags(source = {}) {
    const tags = new Set(splitWords(source.receiveModeTags).map(normalizeTag));
    const text = upperText(
      source.modes,
      source.compatibleReceiveNodes,
      source.notes,
      source.antennaType,
      source.category,
      source.name,
    );

    if (hasAny(text, [/\bIQ\b/, /\bI\/Q\b/, /\bSDR\b/, /\bBASEBAND\b/, /HACKRF/, /USRP/, /LIMESDR/, /RTL[-\s]*SDR/, /AIRSPY/, /RSPDX/])) {
      addTag(tags, "iq");
    }
    if (hasAny(text, [/SPECTRUM/, /SURVEY/, /SWEEP/, /REAL[-\s]*TIME/, /ANALYZER/, /MONITOR/, /WIDEBAND/, /BB60/, /PR200/])) {
      addTag(tags, "spectrum");
    }
    if (hasAny(text, [/\bWFM\b/, /\bNFM\b/, /\bSFM\b/, /\bFM\b/])) {
      addTag(tags, "fm");
      addTag(tags, "analog");
    }
    if (hasAny(text, [/\bWAM\b/, /\bNAM\b/, /\bAM\b/, /AIRBAND/])) {
      addTag(tags, "am");
      addTag(tags, "analog");
    }
    if (hasAny(text, [/\bUSB\b/, /\bLSB\b/, /\bSSB\b/])) {
      addTag(tags, "ssb");
      addTag(tags, "analog");
    }
    if (hasAny(text, [/\bCW\b/, /MORSE/])) {
      addTag(tags, "cw");
    }
    if (hasAny(text, [/\bP25\b/])) {
      addTag(tags, "p25");
      addTag(tags, "digital");
    }
    if (hasAny(text, [/\bDMR\b/])) {
      addTag(tags, "dmr");
      addTag(tags, "digital");
    }
    if (hasAny(text, [/\bNXDN\b/])) {
      addTag(tags, "nxdn");
      addTag(tags, "digital");
    }
    if (hasAny(text, [/\bTETRA\b/, /\bTET-RA\b/])) {
      addTag(tags, "tetra");
      addTag(tags, "digital");
    }
    if (hasAny(text, [/\bLTE\b/, /\b5G\b/, /\bNR\b/])) {
      addTag(tags, "lte");
      addTag(tags, "cellular");
      addTag(tags, "digital");
    }
    if (hasAny(text, [/\bGSM\b/, /\bCDMA\b/, /\bWCDMA\b/])) {
      addTag(tags, "cellular");
      addTag(tags, "digital");
    }
    if (hasAny(text, [/WI[-\s]*FI/, /802\.11/])) {
      addTag(tags, "wifi");
      addTag(tags, "digital");
    }
    if (hasAny(text, [/\bCUAS\b/, /\bC-UAS\b/, /\bUAS\b/, /DRONE/, /NEAR[-\s]*PEER/, /WAVEFORM/])) {
      addTag(tags, "cuas");
    }
    if (hasAny(text, [/\bDF\b/, /DIRECTION[-\s]*FIND/, /DIRECTIONAL/, /ARRAY/, /KRAKEN/])) {
      addTag(tags, "df");
    }
    if (tags.has("iq") || tags.has("spectrum")) {
      addTag(tags, "unknown");
    }
    return unique(Array.from(tags));
  }

  function deriveSupportedModulations(source = {}, receiveTags = deriveReceiveModeTags(source)) {
    const tags = new Set(splitWords(source.supportedModulations).map(normalizeTag));
    const text = upperText(source.modes, source.compatibleReceiveNodes, source.notes);
    const receiveTagSet = new Set(receiveTags.map(normalizeTag));
    const add = (tag) => addTag(tags, tag);

    if (receiveTagSet.has("fm") || /\bFM\b|\bNFM\b|\bWFM\b|\bSFM\b/.test(text)) add("fm");
    if (receiveTagSet.has("am") || /\bAM\b|\bNAM\b|\bWAM\b/.test(text)) add("am");
    if (receiveTagSet.has("ssb") || /\bUSB\b|\bLSB\b|\bSSB\b/.test(text)) add("ssb");
    if (receiveTagSet.has("cw") || /\bCW\b/.test(text)) add("cw");
    if (receiveTagSet.has("p25")) add("c4fm");
    if (receiveTagSet.has("dmr")) add("4fsk");
    if (receiveTagSet.has("tetra")) add("pi4-dqpsk");
    if (receiveTagSet.has("lte") || receiveTagSet.has("wifi") || receiveTagSet.has("cellular")) add("ofdm");
    if (receiveTagSet.has("digital")) add("fsk");
    return unique(Array.from(tags));
  }

  function deriveSupportedWaveformFamilies(source = {}, receiveTags = deriveReceiveModeTags(source)) {
    const families = new Set(splitWords(source.supportedWaveformFamilies).map(normalizeTag));
    const tags = new Set(receiveTags.map(normalizeTag));
    const add = (family) => addTag(families, family);
    if (tags.has("fm")) add("fm-voice");
    if (tags.has("am")) add("am-voice");
    if (tags.has("ssb")) add("ssb-voice");
    if (tags.has("cw")) add("cw");
    if (tags.has("p25")) add("p25");
    if (tags.has("dmr")) add("dmr");
    if (tags.has("nxdn")) add("nxdn");
    if (tags.has("tetra")) add("tetra");
    if (tags.has("lte")) add("lte");
    if (tags.has("cellular")) add("cellular");
    if (tags.has("wifi")) add("wifi");
    if (tags.has("cuas")) add("cuas");
    return unique(Array.from(families));
  }

  function inferInstantaneousBandwidthMHz(source = {}, receiveTags = []) {
    const explicit = asFiniteNumber(source.instantaneousBandwidthMHz, null);
    if (explicit !== null && explicit > 0) return explicit;
    const min = Math.max(0, asFiniteNumber(source.frequencyMinMHz, 0));
    const max = Math.max(0, asFiniteNumber(source.frequencyMaxMHz, 0));
    const span = max > min ? max - min : 0;
    const tags = new Set(receiveTags.map(normalizeTag));
    if (tags.has("spectrum") || tags.has("iq")) return span ? Math.min(span, 20) : 20;
    if (tags.has("wifi")) return 20;
    if (tags.has("lte") || tags.has("cellular")) return 10;
    return 0.025;
  }

  function normalizeSensorCapability(source = {}) {
    const receiveModeTags = deriveReceiveModeTags(source);
    const min = Math.max(0, asFiniteNumber(source.frequencyMinMHz, 0));
    const max = Math.max(0, asFiniteNumber(source.frequencyMaxMHz, 6000));
    const normalizedMin = Math.min(min, max);
    const normalizedMax = Math.max(min, max);
    const channels = Math.max(1, Math.round(asFiniteNumber(source.channels, 1)));
    const demodulators = Math.max(0, Math.round(asFiniteNumber(source.demodulators, channels)));
    const antennaType = String(source.antennaType || "Omni").trim();
    const tags = new Set(receiveModeTags.map(normalizeTag));
    const dfCapable = Boolean(source.dfCapable) || tags.has("df") || /DF|DIRECTION|ARRAY/i.test(antennaType);
    const detectsUnknownSignals = source.detectsUnknownSignals === false
      ? false
      : Boolean(source.detectsUnknownSignals) || tags.has("spectrum") || tags.has("iq");

    return {
      frequencyMinMHz: normalizedMin,
      frequencyMaxMHz: normalizedMax,
      instantaneousBandwidthMHz: inferInstantaneousBandwidthMHz({ ...source, frequencyMinMHz: normalizedMin, frequencyMaxMHz: normalizedMax }, receiveModeTags),
      channels,
      demodulators,
      sensitivityDbm: asFiniteNumber(source.sensitivityDbm, DEFAULT_SENSOR_SENSITIVITY_DBM),
      antennaType,
      antennaGainDbi: asFiniteNumber(source.antennaGainDbi, 0),
      antennaHeightM: Math.max(0, asFiniteNumber(source.antennaHeightM, 2)),
      systemLossDb: Math.max(0, asFiniteNumber(source.systemLossDb, DEFAULT_SENSOR_SYSTEM_LOSS_DB)),
      modes: String(source.modes || "").trim(),
      receiveModeTags,
      supportedModulations: deriveSupportedModulations(source, receiveModeTags),
      supportedWaveformFamilies: deriveSupportedWaveformFamilies(source, receiveModeTags),
      dfCapable,
      detectsUnknownSignals,
    };
  }

  function deriveSensorCompatibleReceiveNodes(source = {}) {
    const sensor = normalizeSensorCapability(source);
    const nodes = [];
    const fmt = (value) => value >= 100 ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, "");
    nodes.push(`RF emitter emissions within ${fmt(sensor.frequencyMinMHz)}-${fmt(sensor.frequencyMaxMHz)} MHz`);
    const tags = new Set(sensor.receiveModeTags);
    if (tags.has("iq") || tags.has("spectrum")) nodes.push("wideband IQ / spectrum survey nodes");
    if (tags.has("fm")) nodes.push("FM voice and narrowband tactical radio nodes");
    if (tags.has("am")) nodes.push("AM voice / airband-style nodes");
    if (tags.has("ssb")) nodes.push("SSB voice and low-rate data nodes");
    if (tags.has("cw")) nodes.push("CW / narrowband carrier nodes");
    if (tags.has("p25") || tags.has("dmr") || tags.has("nxdn") || tags.has("tetra")) nodes.push("digital LMR presence and demod-capable nodes");
    if (tags.has("lte") || tags.has("cellular") || tags.has("wifi")) nodes.push("cellular / Wi-Fi waveform-indicator nodes");
    if (tags.has("cuas")) nodes.push("CUAS and near-peer waveform indicator nodes");
    if (sensor.dfCapable) nodes.push("direction-finding capable nodes");
    return unique(nodes).join("; ");
  }

  function normalizeSensorProfile(profile = {}) {
    const normalized = normalizeSensorCapability(profile);
    return {
      ...profile,
      ...normalized,
      compatibleReceiveNodes: String(profile.compatibleReceiveNodes || deriveSensorCompatibleReceiveNodes({ ...profile, ...normalized })).trim(),
    };
  }

  function inferEmissionBandwidthMHz(source = {}) {
    const explicitMHz = asFiniteNumber(source.occupiedBandwidthMHz ?? source.bandwidthMHz, null);
    if (explicitMHz !== null && explicitMHz > 0) return explicitMHz;
    const bandwidthKHz = asFiniteNumber(source.bandwidthKHz, null);
    if (bandwidthKHz !== null && bandwidthKHz > 0) return bandwidthKHz / 1000;
    const text = upperText(source.waveform, source.modulation, source.name, source.type);
    if (/802\.11|WI[-\s]*FI/.test(text)) return 20;
    if (/\bLTE\b|\b5G\b|\bNR\b/.test(text)) return 10;
    if (/RADAR|JAMMER|NOISE/.test(text)) return 5;
    if (/P25|DMR|NXDN|NFM|VHF|UHF|FM/.test(text)) return 0.0125;
    if (/AM|AIRBAND/.test(text)) return 0.025;
    if (/SSB|USB|LSB|CW/.test(text)) return 0.003;
    return DEFAULT_EMITTER_BANDWIDTH_MHZ;
  }

  function deriveEmissionFamilies(source = {}) {
    const text = upperText(source.waveform, source.modulation, source.name, source.type);
    const families = new Set();
    const add = (family) => addTag(families, family);
    if (/\bP25\b/.test(text)) add("p25");
    if (/\bDMR\b/.test(text)) add("dmr");
    if (/\bNXDN\b/.test(text)) add("nxdn");
    if (/\bTETRA\b|\bTET-RA\b/.test(text)) add("tetra");
    if (/\bLTE\b|\b5G\b|\bNR\b/.test(text)) add("lte");
    if (/\bGSM\b|\bCDMA\b|\bWCDMA\b/.test(text)) add("cellular");
    if (/WI[-\s]*FI|802\.11/.test(text)) add("wifi");
    if (/\bCUAS\b|\bC-UAS\b|\bUAS\b|DRONE/.test(text)) add("cuas");
    if (/SATCOM|MUOS|STARSHIELD|INMARSAT|VIASAT|WGS|AEHF|BLOS/.test(text)) add("satcom");
    if (/SRW|ANW2|TRELLISWARE|MANET|MESH/.test(text)) add("manet");
    if (/RADAR|PULSE|LPI|FMCW/.test(text)) add("radar");
    if (/\bWFM\b|\bNFM\b|\bSFM\b|\bFM\b|ANALOG/.test(text)) add("fm-voice");
    if (/\bWAM\b|\bNAM\b|\bAM\b|AIRBAND/.test(text)) add("am-voice");
    if (/\bUSB\b|\bLSB\b|\bSSB\b/.test(text)) add("ssb-voice");
    if (/\bCW\b|MORSE/.test(text)) add("cw");
    if (!families.size) add("unknown-signal");
    return unique(Array.from(families));
  }

  function deriveEmissionModulations(source = {}) {
    const text = upperText(source.waveform, source.modulation, source.name, source.type);
    const modulations = new Set(splitWords(source.modulation).map(normalizeTag));
    const add = (modulation) => addTag(modulations, modulation);
    if (/\bFM\b|\bNFM\b|\bWFM\b|\bSFM\b/.test(text)) add("fm");
    if (/\bAM\b|\bNAM\b|\bWAM\b/.test(text)) add("am");
    if (/\bUSB\b|\bLSB\b|\bSSB\b/.test(text)) add("ssb");
    if (/\bCW\b/.test(text)) add("cw");
    if (/OFDM|LTE|WI[-\s]*FI|802\.11/.test(text)) add("ofdm");
    if (/QPSK/.test(text)) add("qpsk");
    if (/4FSK|C4FM|P25|DMR|NXDN/.test(text)) add("fsk");
    return unique(Array.from(modulations));
  }

  function normalizeEmitterEmission(emitter = {}, emission = {}) {
    const ext = emitter.ext || {};
    const frequencyMHz = asFiniteNumber(emission.frequencyMHz ?? emitter.frequencyMHz ?? ext.frequencyMHz, null);
    const merged = {
      ...emitter,
      ...ext,
      ...emission,
      frequencyMHz,
      waveform: emission.waveform ?? emitter.waveform ?? ext.waveform ?? "",
      modulation: emission.modulation ?? emitter.modulation ?? ext.modulation ?? "",
      bandwidthKHz: emission.bandwidthKHz ?? emitter.bandwidthKHz ?? ext.bandwidthKHz,
      bandwidthMHz: emission.bandwidthMHz ?? emitter.bandwidthMHz ?? ext.bandwidthMHz,
      occupiedBandwidthMHz: emission.occupiedBandwidthMHz ?? emitter.occupiedBandwidthMHz ?? ext.occupiedBandwidthMHz,
    };
    const bandwidthMHz = Math.max(0, inferEmissionBandwidthMHz(merged));
    const dutyCycle = clamp(asFiniteNumber(emission.dutyCycle ?? emitter.dutyCycle ?? ext.dutyCycle, 1), 0.001, 1);
    return {
      id: String(emission.id ?? emitter.id ?? "primary"),
      name: String(emission.name || emitter.emitterLabel || emitter.name || "Emission"),
      frequencyMHz,
      centerFrequencyMHz: frequencyMHz,
      bandwidthMHz,
      bandwidthKHz: bandwidthMHz * 1000,
      occupiedBandwidthMHz: bandwidthMHz,
      lowerMHz: frequencyMHz !== null ? frequencyMHz - (bandwidthMHz / 2) : null,
      upperMHz: frequencyMHz !== null ? frequencyMHz + (bandwidthMHz / 2) : null,
      waveform: String(merged.waveform || "").trim(),
      modulation: String(merged.modulation || "").trim(),
      waveformFamilies: deriveEmissionFamilies(merged),
      modulations: deriveEmissionModulations(merged),
      powerW: Math.max(0.001, asFiniteNumber(emission.powerW ?? emitter.powerW ?? ext.powerW, DEFAULT_EMITTER_POWER_W)),
      dutyCycle,
      dutyCyclePenaltyDb: dutyCycle < 1 ? 10 * Math.log10(dutyCycle) : 0,
      antennaGainDbi: asFiniteNumber(emission.antennaGainDbi ?? emitter.antennaGainDbi ?? ext.antennaGainDbi, 2.15),
      antennaHeightM: Math.max(0, asFiniteNumber(emission.antennaHeightM ?? emitter.antennaHeightM ?? ext.antennaHeightM, 2)),
      systemLossDb: Math.max(0, asFiniteNumber(emission.systemLossDb ?? emitter.systemLossDb ?? ext.systemLossDb, 3)),
    };
  }

  function normalizePropagationResult(propagation = null) {
    if (!propagation) return null;
    const forwardProfile = propagation.forwardProfile || null;
    const forwardSimulation = propagation.forwardSimulation || null;
    const source = forwardSimulation || forwardProfile || propagation;
    const rxDbm = asFiniteNumber(source.rssiDbm, null);
    if (rxDbm === null) return null;
    const distanceKm = asFiniteNumber(source.distanceKm ?? forwardProfile?.distanceKm ?? propagation.distanceKm, null);
    const buildingLossDb = asFiniteNumber(source.buildingLossDb ?? forwardSimulation?.buildingLossDb ?? forwardProfile?.buildingLossDb, 0);
    return {
      rxDbm,
      pathLossDb: asFiniteNumber(source.pathLossDb ?? forwardProfile?.pathLossDb, null),
      distanceM: distanceKm !== null ? distanceKm * 1000 : asFiniteNumber(propagation.distanceM, null),
      terrainSource: propagation.terrainSource ?? null,
      terrainSourceLabel: propagation.terrainSourceLabel || propagation.terrainSource || (propagation.terrainId ? "Terrain" : "No terrain"),
      terrainCompleteness: propagation.terrainCompleteness || source.terrainCompleteness || (propagation.terrainId ? "full" : "none"),
      propagationModel: propagation.propagationModel || "",
      clearancePolicy: propagation.clearancePolicy || "",
      buildingAware: Boolean(propagation.buildingAware),
      buildingBlocked: Boolean(forwardProfile?.buildingBlocked),
      buildingLossDb,
      geometricLosClear: forwardProfile?.geometricLosClear ?? source.lineOfSight ?? null,
      fresnelClear: forwardProfile?.fresnelClear ?? null,
      fresnelPolicyClear: forwardProfile?.passesPolicy ?? null,
      minClearanceM: asFiniteNumber(forwardProfile?.minClearanceM, null),
      minFresnelClearanceM: asFiniteNumber(forwardProfile?.minFresnelClearanceM, null),
      weatherLossDb: asFiniteNumber(propagation.weatherLossDb ?? source.weatherLossDb ?? source.atmosphericLossDb, null),
      cached: Boolean(propagation.cached),
    };
  }

  function frequencyOverlap(sensor, emission) {
    if (!Number.isFinite(emission.frequencyMHz)) {
      return { overlaps: false, fullyContained: false, partial: false };
    }
    const lower = Number.isFinite(emission.lowerMHz) ? emission.lowerMHz : emission.frequencyMHz;
    const upper = Number.isFinite(emission.upperMHz) ? emission.upperMHz : emission.frequencyMHz;
    const overlaps = upper >= sensor.frequencyMinMHz && lower <= sensor.frequencyMaxMHz;
    const fullyContained = lower >= sensor.frequencyMinMHz && upper <= sensor.frequencyMaxMHz;
    return { overlaps, fullyContained, partial: overlaps && !fullyContained };
  }

  function compatibleByIntersection(left = [], right = []) {
    const rightSet = new Set(right.map(normalizeTag));
    return left.map(normalizeTag).some((entry) => rightSet.has(entry));
  }

  function assessReceiveCompatibility(sensor, emission) {
    const supportedFamilies = sensor.supportedWaveformFamilies || [];
    const supportedMods = sensor.supportedModulations || [];
    const receiveTags = sensor.receiveModeTags || [];
    const emissionFamilies = emission.waveformFamilies || [];
    const emissionMods = emission.modulations || [];
    const familyCompatible = compatibleByIntersection(supportedFamilies, emissionFamilies);
    const modulationCompatible = compatibleByIntersection(supportedMods, emissionMods);
    const tagCompatible = compatibleByIntersection(receiveTags, emissionFamilies) || compatibleByIntersection(receiveTags, emissionMods);
    const genericAnalog = compatibleByIntersection(receiveTags, ["analog"]) && compatibleByIntersection(emissionFamilies, ["fm-voice", "am-voice", "ssb-voice"]);
    const spectrumCanIdentify = sensor.detectsUnknownSignals || receiveTags.includes("spectrum") || receiveTags.includes("iq");
    const identificationCompatible = spectrumCanIdentify || familyCompatible || modulationCompatible || tagCompatible || genericAnalog;
    const demodCompatible = familyCompatible || modulationCompatible || tagCompatible || genericAnalog;
    return {
      identificationCompatible,
      demodCompatible,
      familyCompatible,
      modulationCompatible,
      spectrumCanIdentify,
    };
  }

  function statusWeight(status) {
    return {
      "demod-capable": 7000,
      identified: 6000,
      "bandwidth-limited": 5200,
      "mode-mismatch": 5100,
      "energy-detected": 5000,
      "terrain-masked": 3200,
      "below-sensitivity": 3000,
      "pending-propagation": 2500,
      "not-placed": 1500,
      "out-of-range": 1000,
      unconfigured: 0,
    }[status] ?? 0;
  }

  function terrainIsBlocking(propagation) {
    return Boolean(
      propagation?.buildingBlocked
      || propagation?.geometricLosClear === false
      || propagation?.fresnelPolicyClear === false
    );
  }

  function makeResult(status, fields = {}) {
    const marginDb = asFiniteNumber(fields.marginDb, Number.NEGATIVE_INFINITY);
    return {
      status,
      label: fields.label || status,
      className: fields.className || "not-detected",
      marginDb,
      demodMarginDb: asFiniteNumber(fields.demodMarginDb, null),
      rxDbm: asFiniteNumber(fields.rxDbm, null),
      distanceM: asFiniteNumber(fields.distanceM, null),
      energyDetected: Boolean(fields.energyDetected),
      identified: Boolean(fields.identified),
      demodCapable: Boolean(fields.demodCapable),
      sensed: Boolean(fields.energyDetected),
      limitingReason: fields.limitingReason || "",
      positionLabel: fields.positionLabel || "",
      terrainSourceLabel: fields.terrainSourceLabel || "",
      terrainCompleteness: fields.terrainCompleteness || "",
      propagation: fields.propagation || null,
      sensor: fields.sensor || null,
      emission: fields.emission || null,
      asset: fields.asset || fields.emitter || null,
      detail: fields.detail || "",
    };
  }

  function evaluateSensorEmission({ sensor: rawSensor, emitter = {}, emission: rawEmission = {}, propagation = null, sensorPosition = null, emitterPosition = null } = {}) {
    const sensor = normalizeSensorCapability(rawSensor || {});
    const emission = normalizeEmitterEmission(emitter || {}, rawEmission || {});
    const positionLabel = getPlacementLabel(sensorPosition, emitterPosition);
    if (!Number.isFinite(emission.frequencyMHz)) {
      return makeResult("unconfigured", {
        label: "No RF emission configured",
        className: "not-detected",
        sensor,
        emission,
        emitter,
      });
    }

    if (!sensorPosition || !emitterPosition) {
      return makeResult("not-placed", {
        label: "Needs placement",
        className: "not-detected",
        positionLabel,
        limitingReason: positionLabel || "Sensor or emitter is missing map placement.",
        sensor,
        emission,
        emitter,
      });
    }

    const overlap = frequencyOverlap(sensor, emission);
    if (!overlap.overlaps) {
      return makeResult("out-of-range", {
        label: "Out of range",
        className: "not-detected",
        limitingReason: "Emitter occupied spectrum does not overlap this receiver range.",
        sensor,
        emission,
        emitter,
      });
    }

    const normalizedPropagation = normalizePropagationResult(propagation);
    if (!normalizedPropagation) {
      return makeResult("pending-propagation", {
        label: "Evaluating terrain",
        className: "pending",
        positionLabel,
        limitingReason: "Waiting for terrain and weather path profile.",
        sensor,
        emission,
        emitter,
      });
    }

    const rxDbm = normalizedPropagation.rxDbm;
    const marginDb = rxDbm - sensor.sensitivityDbm;
    const demodMarginDb = (rxDbm + emission.dutyCyclePenaltyDb) - sensor.sensitivityDbm;
    const common = {
      marginDb,
      demodMarginDb,
      rxDbm,
      distanceM: normalizedPropagation.distanceM,
      terrainSourceLabel: normalizedPropagation.terrainSourceLabel,
      terrainCompleteness: normalizedPropagation.terrainCompleteness,
      propagation: normalizedPropagation,
      sensor,
      emission,
      emitter,
    };

    if (marginDb < 0) {
      const blocked = terrainIsBlocking(normalizedPropagation);
      return makeResult(blocked ? "terrain-masked" : "below-sensitivity", {
        ...common,
        label: blocked ? "Terrain masked" : "Below sensitivity",
        className: "not-detected",
        limitingReason: blocked
          ? `Terrain/building path loss leaves RX ${Math.abs(marginDb).toFixed(1)} dB below sensitivity.`
          : `RX is ${Math.abs(marginDb).toFixed(1)} dB below sensitivity.`,
      });
    }

    const compatibility = assessReceiveCompatibility(sensor, emission);
    const bandwidthOk = sensor.instantaneousBandwidthMHz >= emission.occupiedBandwidthMHz;
    const demodsOk = sensor.demodulators > 0;
    const strongEnergyLabel = marginDb >= 20 ? "Strong energy" : "Energy detected";

    if (!compatibility.identificationCompatible) {
      return makeResult("mode-mismatch", {
        ...common,
        label: "Mode mismatch",
        className: "marginal",
        energyDetected: true,
        limitingReason: `${strongEnergyLabel}, but this sensor has no matching waveform or modulation support.`,
      });
    }

    if (!compatibility.demodCompatible) {
      return makeResult("energy-detected", {
        ...common,
        label: strongEnergyLabel,
        className: "energy",
        energyDetected: true,
        identified: true,
        limitingReason: "Sensor can detect or classify the signal but does not advertise a compatible demodulator.",
      });
    }

    if (!overlap.fullyContained || !bandwidthOk) {
      const reason = !overlap.fullyContained
        ? "Only part of the occupied emission spectrum is inside the receiver tuning range."
        : `Emission bandwidth ${emission.occupiedBandwidthMHz.toFixed(3)} MHz exceeds instantaneous bandwidth ${sensor.instantaneousBandwidthMHz.toFixed(3)} MHz.`;
      return makeResult("bandwidth-limited", {
        ...common,
        label: "Bandwidth limited",
        className: "marginal",
        energyDetected: true,
        identified: true,
        limitingReason: reason,
      });
    }

    if (!demodsOk) {
      return makeResult("identified", {
        ...common,
        label: "Identified",
        className: "identified",
        energyDetected: true,
        identified: true,
        limitingReason: "No demodulator channel is available for this sensor record.",
      });
    }

    if (demodMarginDb < DEMOD_MARGIN_DB) {
      return makeResult("identified", {
        ...common,
        label: "Identified",
        className: "identified",
        energyDetected: true,
        identified: true,
        limitingReason: `Demod margin is ${demodMarginDb.toFixed(1)} dB; ${DEMOD_MARGIN_DB} dB is required for reliable receive.`,
      });
    }

    return makeResult("demod-capable", {
      ...common,
      label: "Demod capable",
      className: "detectable",
      energyDetected: true,
      identified: true,
      demodCapable: true,
      limitingReason: "Compatible receive mode, bandwidth, and margin.",
    });
  }

  function getPlacementLabel(sensorPosition, emitterPosition) {
    if (!sensorPosition && !emitterPosition) return "Sensor + emitter not placed";
    if (!sensorPosition) return "Sensor not placed";
    if (!emitterPosition) return "Emitter not placed";
    return "";
  }

  function compareSensorEvaluations(a, b) {
    const scoreA = statusWeight(a?.status) + clamp(asFiniteNumber(a?.marginDb, -200), -200, 200);
    const scoreB = statusWeight(b?.status) + clamp(asFiniteNumber(b?.marginDb, -200), -200, 200);
    return scoreB - scoreA;
  }

  function pickBestSensorEmissionEvaluation(entries = []) {
    return entries.filter(Boolean).sort(compareSensorEvaluations)[0] || null;
  }

  function dedupeEmitterEmissions(emissions = []) {
    const seen = new Map();
    emissions.forEach((entry) => {
      const normalized = normalizeEmitterEmission({}, entry);
      if (!Number.isFinite(normalized.frequencyMHz)) return;
      const key = [
        normalized.frequencyMHz.toFixed(3),
        normalized.occupiedBandwidthMHz.toFixed(3),
        normalized.waveform.toUpperCase(),
        normalized.modulation.toUpperCase(),
      ].join("|");
      if (!seen.has(key)) {
        seen.set(key, entry);
      }
    });
    return Array.from(seen.values());
  }

  const api = {
    DEMOD_MARGIN_DB,
    assessReceiveCompatibility,
    compareSensorEvaluations,
    dedupeEmitterEmissions,
    deriveReceiveModeTags,
    deriveSensorCompatibleReceiveNodes,
    evaluateSensorEmission,
    normalizeEmitterEmission,
    normalizePropagationResult,
    normalizeSensorCapability,
    normalizeSensorProfile,
    pickBestSensorEmissionEvaluation,
  };

  globalScope.RfSimSensorEvaluation = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
