self.addEventListener("message", (event) => {
  const { type, payload } = event.data;

  try {
    if (type === "simulation:cancel") {
      canceledSimulationRequestIds.add(payload?.requestId);
      return;
    }

    if (type === "terrain:cache") {
      terrainCache.set(payload.id, payload);
      clearComputationCaches();
      self.postMessage({
        type: "terrain:cached",
        payload: { id: payload.id },
      });
      return;
    }

    if (type === "terrain:clear") {
      terrainCache.clear();
      clearComputationCaches();
      return;
    }

    if (type === "terrain:remove") {
      terrainCache.delete(payload.id);
      clearComputationCaches();
      return;
    }

    if (type === "simulation:start") {
      const result = runSimulation(payload, (progress) => {
        self.postMessage({
          type: "simulation:progress",
          payload: progress,
        });
      });
      self.postMessage(
        {
          type: "simulation:complete",
          payload: result,
        },
        [
          result.latitudes.buffer,
          result.longitudes.buffer,
          result.rssi.buffer,
          result.lineOfSight.buffer,
        ],
      );
      return;
    }

    if (type === "inspection:start") {
      self.postMessage({
        type: "inspection:complete",
        payload: inspectPoint(payload),
      });
      return;
    }

    if (type === "planning:start") {
      self.postMessage({
        type: "planning:complete",
        payload: planSites(payload),
      });
      return;
    }

    if (type === "site-study:start") {
      self.postMessage({
        type: "site-study:complete",
        payload: runSiteStudy(payload),
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "SIMULATION_CANCELED") {
      return;
    }
    self.postMessage({
      type: "engine:error",
      payload: {
        message: error instanceof Error ? error.message : "Simulation engine error.",
      },
    });
  }
});

const terrainCache = new Map();
const canceledSimulationRequestIds = new Set();
const terrainFieldMemo = new Map();
const terrainTraceMemo = new Map();
const simulateLinkMemo = new Map();
const pathProfileMemo = new Map();

function getNowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function memoize(map, key, factory, maxEntries = 6000) {
  if (map.has(key)) {
    return map.get(key);
  }
  const value = factory();
  if (map.size >= maxEntries) {
    map.clear();
  }
  map.set(key, value);
  return value;
}

function clearComputationCaches() {
  terrainFieldMemo.clear();
  terrainTraceMemo.clear();
  simulateLinkMemo.clear();
  pathProfileMemo.clear();
}

function buildWeatherCacheKey(weather = {}) {
  return [
    weather.temperatureC ?? "",
    weather.humidity ?? "",
    weather.pressureHpa ?? "",
    weather.windSpeedMps ?? "",
    weather.source ?? "",
  ].join(",");
}

function buildEndpointCacheKey(endpoint = {}) {
  return [
    endpoint.id ?? endpoint.name ?? "",
    endpoint.lat ?? "",
    endpoint.lon ?? "",
    endpoint.antennaHeightM ?? "",
    endpoint.frequencyMHz ?? "",
    endpoint.powerW ?? "",
    endpoint.antennaGainDbi ?? "",
    endpoint.receiverGainDbi ?? "",
    endpoint.receiverSensitivityDbm ?? "",
    endpoint.systemLossDb ?? "",
    endpoint.type ?? "",
    endpoint.groundElevationM ?? "",
  ].join(",");
}

function runSimulation(payload, reportProgress = () => {}) {
  const startedAt = getNowMs();
  const {
    requestId,
    asset,
    weather,
    terrainId,
    radiusMeters,
    gridMeters,
    receiverHeight,
    opacity,
    propagationModel,
  } = payload;
  canceledSimulationRequestIds.delete(requestId);
  const terrain = resolveTerrain(terrainId);
  const latStep = metersToLatitudeDegrees(gridMeters);
  const lonStep = metersToLongitudeDegrees(gridMeters, asset.lat);
  const estimatedCells = Math.ceil(Math.PI * (radiusMeters / gridMeters) ** 2);
  const latitudes = new Float64Array(estimatedCells);
  const longitudes = new Float64Array(estimatedCells);
  const rssi = new Float32Array(estimatedCells);
  const lineOfSight = new Uint8Array(estimatedCells);
  const totalRows = Math.max(1, Math.floor((radiusMeters * 2) / gridMeters) + 1);

  let count = 0;
  let processedRows = 0;
  reportProgress({
    requestId,
    fraction: 0,
    stage: "Tracing RF paths...",
    detail: "0%",
  });
  for (let northMeters = -radiusMeters; northMeters <= radiusMeters; northMeters += gridMeters) {
    if (canceledSimulationRequestIds.has(requestId)) {
      canceledSimulationRequestIds.delete(requestId);
      throw new Error("SIMULATION_CANCELED");
    }
    const lat = asset.lat + metersToLatitudeDegrees(northMeters);
    for (let eastMeters = -radiusMeters; eastMeters <= radiusMeters; eastMeters += gridMeters) {
      if (canceledSimulationRequestIds.has(requestId)) {
        canceledSimulationRequestIds.delete(requestId);
        throw new Error("SIMULATION_CANCELED");
      }
      const distanceMeters = Math.hypot(northMeters, eastMeters);
      if (distanceMeters > radiusMeters) {
        continue;
      }

      const lon = asset.lon + metersToLongitudeDegrees(eastMeters, asset.lat);
      const result = simulateLink(
        asset,
        {
          lat,
          lon,
          antennaHeightM: receiverHeight,
          receiverGainDbi: 0,
          systemLossDb: 0,
        },
        terrain,
        weather,
        propagationModel,
      );

      latitudes[count] = lat;
      longitudes[count] = lon;
      rssi[count] = result.rssiDbm;
      lineOfSight[count] = result.lineOfSight ? 1 : 0;
      count += 1;
    }
    processedRows += 1;
    if (processedRows === totalRows || processedRows === 1 || processedRows % 4 === 0) {
      const fraction = clamp(processedRows / totalRows, 0, 1);
      reportProgress({
        requestId,
        fraction,
        stage: "Tracing RF paths...",
        detail: `${Math.round(fraction * 100)}%`,
      });
    }
  }

  return {
    requestId,
    asset,
    terrainId,
    receiverHeight,
    radiusMeters,
    opacity,
    propagationModel,
    gridLatStepDeg: latStep,
    gridLonStepDeg: lonStep,
    latitudes: latitudes.slice(0, count),
    longitudes: longitudes.slice(0, count),
    rssi: rssi.slice(0, count),
    lineOfSight: lineOfSight.slice(0, count),
    elapsedMs: Math.round(getNowMs() - startedAt),
  };
}

function inspectPoint(payload) {
  const startedAt = getNowMs();
  const { asset, target, weather, terrainId, receiverHeight, propagationModel } = payload;
  return {
    ...simulateLink(
    asset,
    {
      lat: target.lat,
      lon: target.lon,
      antennaHeightM: receiverHeight,
      receiverGainDbi: 0,
      systemLossDb: 0,
    },
    resolveTerrain(terrainId),
    weather,
    propagationModel,
    ),
    elapsedMs: Math.round(getNowMs() - startedAt),
  };
}

function planSites(payload) {
  const startedAt = getNowMs();
  const {
    requestId,
    polygon,
    txAsset,
    rxAsset,
    enemyAssets,
    gridMeters,
    minSeparationMeters,
    detectionWeight,
    separationWeight,
    floorM,
    ceilingM,
    weather,
    terrainId,
    propagationModel,
  } = payload;

  if (!polygon?.length || polygon.length < 3) {
    throw new Error("Draw a planning region first.");
  }

  const terrain = resolveTerrain(terrainId);
  const bounds = polygonBounds(polygon);
  const anchorLat = polygon[0].lat;
  const candidates = [];
  const latStep = metersToLatitudeDegrees(gridMeters);
  const lonStep = metersToLongitudeDegrees(gridMeters, anchorLat);

  for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += latStep) {
    for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += lonStep) {
      if (!pointInPolygon({ lat, lon }, polygon)) {
        continue;
      }
      candidates.push({ lat, lon });
    }
  }

  if (candidates.length < 2) {
    throw new Error("Planning region is too small for the selected candidate spacing.");
  }

  const plannedTxHeight = clamp(txAsset.antennaHeightM, floorM, ceilingM);
  const plannedRxHeight = clamp(rxAsset.antennaHeightM, floorM, ceilingM);
  const best = [];
  const terrainAvailable = Boolean(terrain);
  const candidateGroundElevations = terrainAvailable
    ? candidates.map((candidate) => sampleTerrain(candidate.lat, candidate.lon, terrain))
    : null;

  for (let txIndex = 0; txIndex < candidates.length; txIndex += 1) {
    const txCandidate = candidates[txIndex];
    const txGroundElevationM = candidateGroundElevations ? candidateGroundElevations[txIndex] : null;
    const txPlacement = {
      ...txAsset,
      lat: txCandidate.lat,
      lon: txCandidate.lon,
      antennaHeightM: plannedTxHeight,
      groundElevationM: txGroundElevationM,
    };

    for (let rxIndex = txIndex + 1; rxIndex < candidates.length; rxIndex += 1) {
      const rxCandidate = candidates[rxIndex];
      const separationMeters = haversineKm(
        txCandidate.lat,
        txCandidate.lon,
        rxCandidate.lat,
        rxCandidate.lon,
      ) * 1000;
      if (separationMeters < minSeparationMeters) {
        continue;
      }

      const rxGroundElevationM = candidateGroundElevations ? candidateGroundElevations[rxIndex] : null;
      const rxPlacement = {
        ...rxAsset,
        lat: rxCandidate.lat,
        lon: rxCandidate.lon,
        antennaHeightM: plannedRxHeight,
        groundElevationM: rxGroundElevationM,
      };
      const friendlyLink = simulateLink(
        txPlacement,
        {
          ...rxPlacement,
          receiverGainDbi: rxPlacement.antennaGainDbi ?? 0,
          systemLossDb: rxPlacement.systemLossDb ?? 0,
        },
        terrain,
        weather,
        propagationModel,
      );

      let detectionPenalty = 0;
      let maxEnemyRssi = -140;
      for (let enemyIndex = 0; enemyIndex < enemyAssets.length; enemyIndex += 1) {
        const enemy = enemyAssets[enemyIndex];
        const txExposure = simulateLink(
          txPlacement,
          {
            lat: enemy.lat,
            lon: enemy.lon,
            antennaHeightM: 2,
            receiverGainDbi: 0,
            systemLossDb: 0,
          },
          terrain,
          weather,
          propagationModel,
        );
        const rxExposure = simulateLink(
          rxPlacement,
          {
            lat: enemy.lat,
            lon: enemy.lon,
            antennaHeightM: 2,
            receiverGainDbi: 0,
            systemLossDb: 0,
          },
          terrain,
          weather,
          propagationModel,
        );
        detectionPenalty += normalizedSignal(txExposure.rssiDbm) + normalizedSignal(rxExposure.rssiDbm);
        maxEnemyRssi = Math.max(maxEnemyRssi, txExposure.rssiDbm, rxExposure.rssiDbm);
      }

      const friendlyScore = normalizedSignal(friendlyLink.rssiDbm) * 1.8;
      const separationScore = Math.min(separationMeters / Math.max(minSeparationMeters, 1), 3) * 15;
      const enemyPenaltyScore = enemyAssets.length
        ? (detectionPenalty / enemyAssets.length) * detectionWeight
        : 0;
      const score = friendlyScore + separationScore * separationWeight - enemyPenaltyScore;

      best.push({
        score,
        friendlyRssiDbm: friendlyLink.rssiDbm,
        friendlyPathLossDb: friendlyLink.pathLossDb,
        friendlyLineOfSight: friendlyLink.lineOfSight,
        maxEnemyRssiDbm: maxEnemyRssi,
        separationMeters,
        tx: txPlacement,
        rx: rxPlacement,
      });
    }
  }

  best.sort((left, right) => right.score - left.score);

  return {
    requestId,
    terrainId,
    recommendations: best.slice(0, 5),
    candidateCount: candidates.length,
    elapsedMs: Math.round(getNowMs() - startedAt),
  };
}

function runSiteStudy(payload) {
  const startedAt = getNowMs();
  const {
    requestId,
    studyType,
    primaryAsset,
    secondaryAsset,
    candidateGeometry,
    objectiveGeometry,
    gridMeters,
    maxMastHeightM,
    topCount,
    weather,
    terrainId,
    propagationModel,
    clearancePolicy,
    linkPreset,
  } = payload;

  if (!candidateGeometry?.points?.length) {
    throw new Error("Select a candidate area or corridor first.");
  }

  const terrain = resolveTerrain(terrainId);
  const candidates = generateCandidatePoints(candidateGeometry, gridMeters);
  if (!candidates.length) {
    throw new Error("No candidate points could be generated from the selected geometry.");
  }

  const results = [];
  if (studyType === "relay" || studyType === "link") {
    if (!primaryAsset) {
      throw new Error("A primary endpoint asset is required for this study.");
    }
    const endpoint = normalizeAssetEndpoint(primaryAsset);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = materializeCandidateEndpoint(candidates[index], linkPreset, maxMastHeightM, index, candidateGeometry.name);
      const profile = buildPathProfile(candidate, endpoint, terrain, weather, propagationModel, clearancePolicy);
      const score = scoreRelayCandidate(profile, linkPreset);
      results.push({
        name: candidate.name,
        lat: candidate.lat,
        lon: candidate.lon,
        score,
        distanceKm: profile.distanceKm,
        requiredMastHeightM: candidate.antennaHeightM + profile.requiredExtraTxHeightM,
        summary: `${profile.distanceKm.toFixed(1)} km · ${profile.fadeMarginDb.toFixed(1)} dB fade`,
        confidenceLabel: terrain ? (terrain.osmBuildingsEnabled ? "Terrain + approximate buildings" : "Terrain only") : "No terrain",
        modeLabel: studyType === "link" ? "Direct Link" : "Relay",
        policyLabel: clearancePolicyLabel(clearancePolicy),
        sourceLabel: terrain ? (terrain.osmBuildingsEnabled ? "Approx Buildings" : "DTED/Cesium") : "No terrain",
        worstPointLabel: profile.worstPoint ? `${profile.worstPoint.lat.toFixed(4)}, ${profile.worstPoint.lon.toFixed(4)}` : "Not available",
        legs: [serializeLeg("Candidate → Endpoint", candidate, endpoint, profile)],
      });
    }
  } else if (studyType === "sensor") {
    const objectiveSamples = sampleObjectivePoints(objectiveGeometry ?? candidateGeometry);
    const backhaul = primaryAsset ? normalizeAssetEndpoint(primaryAsset) : null;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = materializeCandidateEndpoint(candidates[index], linkPreset, maxMastHeightM, index, candidateGeometry.name);
      const visibilityProfiles = objectiveSamples.map((sample) => buildPathProfile(candidate, sample, terrain, weather, propagationModel, "geometric-los"));
      const backhaulProfile = backhaul ? buildPathProfile(candidate, backhaul, terrain, weather, propagationModel, clearancePolicy) : null;
      const visibleCount = visibilityProfiles.filter((profile) => profile.geometricLosClear).length;
      const visibilityScore = objectiveSamples.length ? (visibleCount / objectiveSamples.length) * 100 : 0;
      const score = visibilityScore + (backhaulProfile ? clamp(backhaulProfile.fadeMarginDb + 40, 0, 40) : 20);
      results.push({
        name: `${candidateGeometry.name || "Sensor"} ${index + 1}`,
        lat: candidate.lat,
        lon: candidate.lon,
        score,
        distanceKm: backhaulProfile?.distanceKm ?? 0,
        requiredMastHeightM: candidate.antennaHeightM + (backhaulProfile?.requiredExtraTxHeightM ?? 0),
        summary: `${visibleCount}/${objectiveSamples.length} objective rays clear`,
        confidenceLabel: terrain ? "Terrain only" : "No terrain",
        modeLabel: "Sensor",
        policyLabel: "Visibility + Backhaul",
        sourceLabel: terrain ? "DTED/Cesium" : "No terrain",
        worstPointLabel: backhaulProfile?.worstPoint ? `${backhaulProfile.worstPoint.lat.toFixed(4)}, ${backhaulProfile.worstPoint.lon.toFixed(4)}` : "Not available",
        legs: backhaulProfile ? [serializeLeg("Sensor → Backhaul", candidate, backhaul, backhaulProfile)] : [],
      });
    }
  } else if (studyType === "command-post") {
    if (!primaryAsset) {
      throw new Error("A primary support asset is required for command-post siting.");
    }
    const supportA = normalizeAssetEndpoint(primaryAsset);
    const supportB = secondaryAsset ? normalizeAssetEndpoint(secondaryAsset) : null;
    const threatSamples = sampleObjectivePoints(objectiveGeometry ?? candidateGeometry);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = materializeCandidateEndpoint(candidates[index], linkPreset, maxMastHeightM, index, candidateGeometry.name);
      const toA = buildPathProfile(candidate, supportA, terrain, weather, propagationModel, clearancePolicy);
      const toB = supportB ? buildPathProfile(candidate, supportB, terrain, weather, propagationModel, clearancePolicy) : null;
      const threatBlocked = threatSamples.filter((sample) => !buildPathProfile(candidate, sample, terrain, weather, propagationModel, "geometric-los").geometricLosClear).length;
      const maskingScore = threatSamples.length ? (threatBlocked / threatSamples.length) * 100 : 0;
      const connectivityScore = clamp(toA.fadeMarginDb + 40, 0, 60) + (toB ? clamp(toB.fadeMarginDb + 40, 0, 40) : 0);
      const score = maskingScore * 0.7 + connectivityScore * 0.6 - Math.max(toA.requiredExtraTxHeightM, toB?.requiredExtraTxHeightM ?? 0) * 1.5;
      results.push({
        name: `${candidateGeometry.name || "CP"} ${index + 1}`,
        lat: candidate.lat,
        lon: candidate.lon,
        score,
        distanceKm: toA.distanceKm,
        requiredMastHeightM: candidate.antennaHeightM + Math.max(toA.requiredExtraTxHeightM, toB?.requiredExtraTxHeightM ?? 0),
        summary: `${maskingScore.toFixed(0)}% masked from threat samples`,
        confidenceLabel: terrain ? "Terrain only" : "No terrain",
        modeLabel: "Command Post",
        policyLabel: "Masking + Connectivity",
        sourceLabel: terrain ? "DTED/Cesium" : "No terrain",
        worstPointLabel: toA.worstPoint ? `${toA.worstPoint.lat.toFixed(4)}, ${toA.worstPoint.lon.toFixed(4)}` : "Not available",
        legs: [serializeLeg("CP → Support A", candidate, supportA, toA)].concat(toB ? [serializeLeg("CP → Support B", candidate, supportB, toB)] : []),
      });
    }
  }

  results.sort((left, right) => right.score - left.score);
  const trimmed = results.slice(0, Math.max(1, topCount || 8));
  return {
    requestId,
    terrainId,
    summary: `${trimmed.length} ranked ${studyType} candidate${trimmed.length === 1 ? "" : "s"} from ${candidates.length} sampled point${candidates.length === 1 ? "" : "s"}.`,
    results: trimmed,
    elapsedMs: Math.round(getNowMs() - startedAt),
  };
}

function generateCandidatePoints(geometry, gridMeters) {
  if (geometry.type === "point") {
    return geometry.points.slice(0, 1);
  }
  if (geometry.type === "polyline") {
    return densifyPolyline(geometry.points, gridMeters);
  }
  if (geometry.type === "polygon") {
    return samplePolygonGrid(geometry.points, gridMeters);
  }
  return [];
}

function densifyPolyline(points, gridMeters) {
  const output = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const distanceMeters = haversineKm(start.lat, start.lon, end.lat, end.lon) * 1000;
    const steps = Math.max(1, Math.ceil(distanceMeters / Math.max(gridMeters, 1)));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      output.push({
        lat: lerp(start.lat, end.lat, t),
        lon: lerp(start.lon, end.lon, t),
      });
    }
  }
  output.push(points[points.length - 1]);
  return dedupePoints(output);
}

function samplePolygonGrid(points, gridMeters) {
  const bounds = polygonBounds(points);
  const candidates = [];
  const latStep = metersToLatitudeDegrees(gridMeters);
  const lonStep = metersToLongitudeDegrees(gridMeters, points[0]?.lat ?? bounds.minLat);
  for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += latStep) {
    for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += lonStep) {
      if (pointInPolygon({ lat, lon }, points)) {
        candidates.push({ lat, lon });
      }
    }
  }
  return dedupePoints(candidates);
}

function dedupePoints(points) {
  const seen = new Set();
  return points.filter((point) => {
    const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAssetEndpoint(asset) {
  return {
    ...asset,
    receiverGainDbi: asset.receiverGainDbi ?? asset.antennaGainDbi ?? 0,
    antennaHeightM: asset.antennaHeightM ?? 2,
  };
}

function materializeCandidateEndpoint(candidate, linkPreset, maxMastHeightM, index, baseName = "Candidate") {
  return {
    lat: candidate.lat,
    lon: candidate.lon,
    name: `${baseName || "Candidate"} ${index + 1}`,
    frequencyMHz: linkPreset.frequencyMHz,
    powerW: linkPreset.powerW,
    antennaGainDbi: linkPreset.antennaGainDbi,
    antennaHeightM: Math.min(linkPreset.antennaHeightM ?? 6, maxMastHeightM || 30),
    receiverSensitivityDbm: linkPreset.receiverSensitivityDbm,
    receiverGainDbi: linkPreset.antennaGainDbi,
    systemLossDb: linkPreset.systemLossDb,
  };
}

function clearancePolicyLabel(clearancePolicy) {
  if (clearancePolicy === "fresnel-60") return "LOS + 60% Fresnel";
  if (clearancePolicy === "fresnel-100") return "LOS + 100% Fresnel";
  if (clearancePolicy === "fresnel-60-buildings") return "LOS + Fresnel + Buildings";
  return "Geometric LOS";
}

function scoreRelayCandidate(profile, linkPreset) {
  const clearBonus = profile.passesPolicy ? 70 : 0;
  const fadeScore = clamp(profile.fadeMarginDb + 30, 0, 40);
  const fresnelScore = clamp(profile.minFresnelClearanceM + 15, 0, 25);
  const mastPenalty = Math.max(0, profile.requiredExtraTxHeightM) * 1.6;
  const marginPenalty = profile.passesPolicy ? 0 : 28;
  return clearBonus + fadeScore + fresnelScore - mastPenalty - marginPenalty;
}

function sampleObjectivePoints(geometry) {
  if (!geometry?.points?.length) {
    return [];
  }
  if (geometry.type === "point") {
    return geometry.points.map((point, index) => ({
      ...point,
      name: geometry.name ? `${geometry.name} ${index + 1}` : `Objective ${index + 1}`,
      antennaHeightM: 2,
      receiverGainDbi: 0,
      systemLossDb: 0,
    }));
  }
  const points = geometry.type === "polyline"
    ? densifyPolyline(geometry.points, Math.max(100, haversineKm(geometry.points[0].lat, geometry.points[0].lon, geometry.points[geometry.points.length - 1].lat, geometry.points[geometry.points.length - 1].lon) * 1000 / 6))
    : samplePolygonGrid(geometry.points, Math.max(150, 300));
  return points.slice(0, 12).map((point, index) => ({
    ...point,
    name: geometry.name ? `${geometry.name} ${index + 1}` : `Objective ${index + 1}`,
    antennaHeightM: 2,
    receiverGainDbi: 0,
    systemLossDb: 0,
  }));
}

function serializeLeg(label, from, to, profile) {
  return {
    label,
    distanceKm: profile.distanceKm,
    geometricLosClear: profile.geometricLosClear,
    minClearanceM: profile.minClearanceM,
    minFresnelClearanceM: profile.minFresnelClearanceM,
    fadeMarginDb: profile.fadeMarginDb,
    pathLossDb: profile.pathLossDb,
    path: [
      { lat: from.lat, lon: from.lon },
      { lat: to.lat, lon: to.lon },
    ],
  };
}

function buildPathProfile(source, target, terrain, weather, propagationModel, clearancePolicy = "geometric-los") {
  const cacheKey = [
    clearancePolicy,
    propagationModel ?? "",
    terrain?.id ?? "none",
    buildWeatherCacheKey(weather),
    buildEndpointCacheKey(source),
    buildEndpointCacheKey(target),
  ].join("|");
  return memoize(pathProfileMemo, cacheKey, () => {
    const distanceKm = haversineKm(source.lat, source.lon, target.lat, target.lon);
    const frequencyMHz = source.frequencyMHz ?? target.frequencyMHz ?? 300;
    const wavelengthM = 300 / Math.max(frequencyMHz, 0.1);
    const totalDistanceMeters = Math.max(distanceKm * 1000, 1);
    const txHeightM = source.antennaHeightM ?? 2;
    const rxHeightM = target.antennaHeightM ?? 2;
    const sourceGround = terrain ? sampleTerrain(source.lat, source.lon, terrain) : 0;
    const targetGround = terrain ? sampleTerrain(target.lat, target.lon, terrain) : 0;
    const sourceAlt = sourceGround + txHeightM;
    const targetAlt = targetGround + rxHeightM;
    const traceSampleMeters = terrain ? estimateTraceSampleMeters(terrain, (source.lat + target.lat) / 2) : 30;
    const steps = Math.max(24, Math.ceil(totalDistanceMeters / traceSampleMeters));

    let minClearanceM = Number.POSITIVE_INFINITY;
    let minFresnelClearanceM = Number.POSITIVE_INFINITY;
    let minRequiredFresnelClearanceM = Number.POSITIVE_INFINITY;
    let maxObstructionM = 0;
    let maxBuildingObstructionM = 0;
    let buildingHitSamples = 0;
    let buildingPathMeters = 0;
    let worstPoint = null;
    const stepDistanceMeters = totalDistanceMeters / steps;
    const fresnelFraction = clearancePolicy === "fresnel-100" ? 1 : clearancePolicy === "fresnel-60" || clearancePolicy === "fresnel-60-buildings" ? 0.6 : 0;

    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      const lat = lerp(source.lat, target.lat, t);
      const lon = lerp(source.lon, target.lon, t);
      const surfaceHeight = terrain ? sampleSurfaceObstruction(lat, lon, terrain) : 0;
      const baseHeight = terrain ? sampleTerrainBase(lat, lon, terrain) : surfaceHeight;
      const losHeight = lerp(sourceAlt, targetAlt, t);
      const earthCurveDrop = earthCurvatureDropMeters(distanceKm * t);
      const clearanceM = (losHeight - earthCurveDrop) - surfaceHeight;
      const d1 = totalDistanceMeters * t;
      const d2 = totalDistanceMeters - d1;
      const fresnelRadiusM = Math.sqrt(Math.max((wavelengthM * d1 * d2) / Math.max(d1 + d2, 1), 0));
      const fresnelClearanceM = clearanceM - fresnelRadiusM;
      const requiredFresnelClearanceM = clearanceM - (fresnelRadiusM * fresnelFraction);
      const obstruction = Math.max(0, surfaceHeight - (losHeight - earthCurveDrop));
      const buildingHeight = Math.max(0, surfaceHeight - baseHeight);
      if (clearanceM < minClearanceM) {
        minClearanceM = clearanceM;
        worstPoint = { lat, lon };
      }
      if (fresnelClearanceM < minFresnelClearanceM) {
        minFresnelClearanceM = fresnelClearanceM;
      }
      if (requiredFresnelClearanceM < minRequiredFresnelClearanceM) {
        minRequiredFresnelClearanceM = requiredFresnelClearanceM;
      }
      maxObstructionM = Math.max(maxObstructionM, obstruction);
      if (buildingHeight > 2 && obstruction > 0) {
        buildingHitSamples += 1;
        buildingPathMeters += stepDistanceMeters;
        maxBuildingObstructionM = Math.max(maxBuildingObstructionM, Math.min(obstruction, buildingHeight));
      }
    }

    const terrainProfile = {
      lineOfSight: minClearanceM > 0,
      maxObstructionM: Math.max(0, maxObstructionM),
      buildingPathMeters,
      buildingHitSamples,
      maxBuildingObstructionM,
      buildingLineOfSightBlocked: maxBuildingObstructionM > 0.5,
    };
    const simulated = simulateLink(source, target, terrain, weather, propagationModel);
    const fadeMarginDb = simulated.rssiDbm - (target.receiverSensitivityDbm ?? -95);
    const passesBuildings = clearancePolicy !== "fresnel-60-buildings" || !terrainProfile.buildingLineOfSightBlocked;
    const passesPolicy = minClearanceM >= 0 && (fresnelFraction === 0 || minRequiredFresnelClearanceM >= 0) && passesBuildings;
    const geometricDeficit = Math.max(0, -minClearanceM + 1);
    const fresnelDeficit = fresnelFraction > 0 ? Math.max(0, -(minRequiredFresnelClearanceM) + 1) : 0;
    const extraHeightNeeded = Math.max(geometricDeficit, fresnelDeficit);

    return {
      distanceKm,
      geometricLosClear: minClearanceM >= 0,
      fresnelClear: fresnelFraction === 0 ? true : minFresnelClearanceM >= 0,
      passesPolicy,
      minClearanceM: Number.isFinite(minClearanceM) ? minClearanceM : 0,
      minFresnelClearanceM: Number.isFinite(minFresnelClearanceM) ? minFresnelClearanceM : 0,
      buildingBlocked: terrainProfile.buildingLineOfSightBlocked,
      pathLossDb: simulated.pathLossDb,
      rssiDbm: simulated.rssiDbm,
      fadeMarginDb,
      requiredExtraTxHeightM: extraHeightNeeded,
      requiredExtraRxHeightM: extraHeightNeeded,
      worstPoint,
    };
  }, 2000);
}

function simulateLink(txAsset, rxTarget, terrain, weather, propagationModel) {
  const cacheKey = [
    propagationModel ?? "",
    terrain?.id ?? "none",
    buildWeatherCacheKey(weather),
    buildEndpointCacheKey(txAsset),
    buildEndpointCacheKey(rxTarget),
  ].join("|");
  return memoize(simulateLinkMemo, cacheKey, () => {
    const distanceKm = haversineKm(txAsset.lat, txAsset.lon, rxTarget.lat, rxTarget.lon);
    const includeTerrain = usesTerrainEffects(propagationModel);
    const includeAtmosphere = usesAtmosphericEffects(propagationModel);
    const includeBuildings = usesBuildingEffects(propagationModel);
    const terrainProfile = includeTerrain
      ? traceTerrain(
        txAsset,
        rxTarget,
        txAsset.antennaHeightM ?? 0,
        rxTarget.antennaHeightM ?? 0,
        terrain,
      )
      : { lineOfSight: true, maxObstructionM: 0, buildingPathMeters: 0, buildingHitSamples: 0 };
    const freeSpaceDb = freeSpacePathLoss(distanceKm, txAsset.frequencyMHz);
    const atmosphericDb = includeAtmosphere
      ? atmosphericAttenuation(txAsset.frequencyMHz, weather, distanceKm)
      : 0;
    const diffractionDb = includeTerrain
      ? diffractionPenalty(terrainProfile.maxObstructionM, distanceKm, txAsset.frequencyMHz)
      : 0;
    const buildingLossDb = includeBuildings
      ? buildingStructurePenalty(terrainProfile, txAsset.frequencyMHz, terrain)
      : 0;

    let pathLossDb = freeSpaceDb;
    if (propagationModel === "itu-p526") {
      pathLossDb += diffractionDb;
    } else if (propagationModel === "itu-hybrid") {
      pathLossDb += atmosphericDb + diffractionDb;
    } else if (propagationModel === "itu-buildings-weather") {
      pathLossDb += atmosphericDb + diffractionDb + buildingLossDb;
    }

    const txPowerDbm = wattsToDbm(txAsset.powerW);
    const txGainDb = txAsset.antennaGainDbi ?? 0;
    const rxGainDb = rxTarget.receiverGainDbi ?? 0;
    const totalSystemLossDb = (txAsset.systemLossDb ?? 0) + (rxTarget.systemLossDb ?? 0);
    const jammerBoostDb = txAsset.type === "jammer" ? 6 : 0;
    const rssiDbm = txPowerDbm + txGainDb + rxGainDb + jammerBoostDb - pathLossDb - totalSystemLossDb;

    return {
      distanceKm,
      pathLossDb,
      lineOfSight: terrainProfile.lineOfSight,
      maxObstructionM: terrainProfile.maxObstructionM,
      terrainCompleteness: terrainProfile.terrainCompleteness ?? (terrain ? "full" : "none"),
      buildingLossDb,
      buildingPathMeters: terrainProfile.buildingPathMeters,
      buildingHitSamples: terrainProfile.buildingHitSamples,
      rssiDbm,
    };
  }, 4000);
}

function usesTerrainEffects(propagationModel) {
  return propagationModel === "itu-p526"
    || propagationModel === "itu-hybrid"
    || propagationModel === "itu-buildings-weather";
}

function usesAtmosphericEffects(propagationModel) {
  return propagationModel === "itu-hybrid" || propagationModel === "itu-buildings-weather";
}

function usesBuildingEffects(propagationModel) {
  return propagationModel === "itu-buildings-weather";
}

function traceTerrain(source, target, txHeightM, rxHeightM, terrain) {
  if (!terrain) {
    return { lineOfSight: true, maxObstructionM: 0, buildingPathMeters: 0, buildingHitSamples: 0, maxBuildingObstructionM: 0, buildingLineOfSightBlocked: false, terrainCompleteness: "none" };
  }
  const cacheKey = [
    terrain.id ?? "none",
    buildEndpointCacheKey(source),
    buildEndpointCacheKey(target),
    txHeightM ?? "",
    rxHeightM ?? "",
  ].join("|");
  return memoize(terrainTraceMemo, cacheKey, () => {
    const totalDistanceKm = haversineKm(source.lat, source.lon, target.lat, target.lon);
    const totalDistanceMeters = totalDistanceKm * 1000;
    const traceSampleMeters = estimateTraceSampleMeters(terrain, (source.lat + target.lat) / 2);
    const steps = Math.max(24, Math.ceil(totalDistanceMeters / traceSampleMeters));
    const sourceGround = sampleTerrain(source.lat, source.lon, terrain);
    const targetGround = sampleTerrain(target.lat, target.lon, terrain);
    const sourceAlt = (Number.isFinite(sourceGround) ? sourceGround : 0) + txHeightM;
    const targetAlt = (Number.isFinite(targetGround) ? targetGround : 0) + rxHeightM;
    let maxObstructionM = 0;
    let buildingPathMeters = 0;
    let buildingHitSamples = 0;
    let maxBuildingObstructionM = 0;
    let sampledCount = 0;
    const stepDistanceMeters = totalDistanceMeters / steps;

    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      const lat = lerp(source.lat, target.lat, t);
      const lon = lerp(source.lon, target.lon, t);
      const terrainHeight = sampleSurfaceObstruction(lat, lon, terrain);
      if (!Number.isFinite(terrainHeight)) {
        continue;
      }
      const baseTerrainHeight = sampleTerrainBase(lat, lon, terrain);
      sampledCount += 1;
      const losHeight = lerp(sourceAlt, targetAlt, t);
      const earthCurveDrop = earthCurvatureDropMeters(totalDistanceKm * t);
      const obstruction = terrainHeight - (losHeight - earthCurveDrop);
      if (obstruction > maxObstructionM) {
        maxObstructionM = obstruction;
      }
      const effectiveBaseHeight = Number.isFinite(baseTerrainHeight) ? baseTerrainHeight : terrainHeight;
      const buildingHeight = Math.max(0, terrainHeight - effectiveBaseHeight);
      if (buildingHeight > 2 && obstruction > 0) {
        buildingPathMeters += stepDistanceMeters;
        buildingHitSamples += 1;
        maxBuildingObstructionM = Math.max(maxBuildingObstructionM, Math.min(obstruction, buildingHeight));
      }
    }

    const terrainCompleteness = sampledCount === steps - 1
      ? "full"
      : sampledCount > 0
        ? "partial"
        : "none";

    return {
      lineOfSight: terrainCompleteness === "none" ? true : maxObstructionM <= 0,
      maxObstructionM: Math.max(0, maxObstructionM),
      buildingPathMeters,
      buildingHitSamples,
      maxBuildingObstructionM,
      buildingLineOfSightBlocked: maxBuildingObstructionM > 0.5,
      terrainCompleteness,
    };
  }, 4000);
}

function estimateTraceSampleMeters(terrain, latitude) {
  const latMeters = Math.abs(terrain.latStepDeg ?? 0) * 111320;
  const lonMeters = Math.abs(terrain.lonStepDeg ?? 0) * 111320 * Math.max(Math.cos((latitude * Math.PI) / 180), 1e-6);
  const cellMeters = Math.max(1, Math.min(latMeters || Number.POSITIVE_INFINITY, lonMeters || Number.POSITIVE_INFINITY));
  return Math.max(8, Math.min(40, cellMeters / 3));
}

function sampleSurfaceObstruction(lat, lon, terrain) {
  if (!terrain?.osmBuildingsEnabled) {
    return sampleTerrain(lat, lon, terrain);
  }
  const cellLatOffset = Math.abs(terrain.latStepDeg ?? 0) * 0.42;
  const cellLonOffset = Math.abs(terrain.lonStepDeg ?? 0) * 0.42;
  const samplePoints = [
    [lat, lon],
    [lat + cellLatOffset, lon],
    [lat - cellLatOffset, lon],
    [lat, lon + cellLonOffset],
    [lat, lon - cellLonOffset],
    [lat + cellLatOffset * 0.7, lon + cellLonOffset * 0.7],
    [lat + cellLatOffset * 0.7, lon - cellLonOffset * 0.7],
    [lat - cellLatOffset * 0.7, lon + cellLonOffset * 0.7],
    [lat - cellLatOffset * 0.7, lon - cellLonOffset * 0.7],
  ];
  let maxHeight = sampleTerrain(lat, lon, terrain);
  for (const [sampleLat, sampleLon] of samplePoints) {
    const sampled = sampleTerrain(sampleLat, sampleLon, terrain);
    if (Number.isFinite(sampled)) {
      maxHeight = Number.isFinite(maxHeight) ? Math.max(maxHeight, sampled) : sampled;
    }
  }
  return maxHeight;
}

function sampleTerrain(lat, lon, terrain) {
  return sampleTerrainField(lat, lon, terrain, "elevations");
}

function sampleTerrainBase(lat, lon, terrain) {
  return sampleTerrainField(lat, lon, terrain, "baseElevations");
}

function sampleTerrainField(lat, lon, terrain, fieldName) {
  if (!terrain) {
    return null;
  }
  const cacheKey = `${terrain.id ?? "none"}|${fieldName}|${lat}|${lon}`;
  return memoize(terrainFieldMemo, cacheKey, () => {
    const rowFloat = (lat - terrain.origin.lat) / terrain.latStepDeg;
    const colFloat = (lon - terrain.origin.lon) / terrain.lonStepDeg;
    const row = Math.floor(rowFloat);
    const col = Math.floor(colFloat);

    if (row < 0 || col < 0 || row >= terrain.rows - 1 || col >= terrain.cols - 1) {
      return null;
    }

    const rowRatio = rowFloat - row;
    const colRatio = colFloat - col;
    const source = terrain[fieldName] ?? terrain.elevations;
    const corners = [
      { weight: (1 - colRatio) * (1 - rowRatio), index: row * terrain.cols + col },
      { weight: colRatio * (1 - rowRatio), index: row * terrain.cols + col + 1 },
      { weight: (1 - colRatio) * rowRatio, index: (row + 1) * terrain.cols + col },
      { weight: colRatio * rowRatio, index: (row + 1) * terrain.cols + col + 1 },
    ];

    let weighted = 0;
    let totalWeight = 0;
    for (const corner of corners) {
      if (!terrainSampleIsValid(terrain, fieldName, corner.index)) {
        continue;
      }
      weighted += source[corner.index] * corner.weight;
      totalWeight += corner.weight;
    }

    if (totalWeight <= 0) {
      return null;
    }
    return weighted / totalWeight;
  }, 20000);
}

function terrainSampleIsValid(terrain, fieldName, index) {
  const source = terrain[fieldName] ?? terrain.elevations;
  const value = source?.[index];
  if (!Number.isFinite(value)) {
    return false;
  }
  return !(terrain.nodataMask instanceof Uint8Array) || terrain.nodataMask[index] !== 1;
}

function getBuildingBandProfile(frequencyMHz) {
  if (frequencyMHz < 30) {
    return null;
  }
  if (frequencyMHz < 300) {
    return {
      band: "vhf",
      penetrationMultiplier: 0.75,
      shadowBaseLossDb: 16,
      shadowObstructionMultiplier: 2.2,
      shadowDistanceMultiplier: 0.7,
      maxShadowExtraDb: 26,
    };
  }
  if (frequencyMHz < 3000) {
    return {
      band: "uhf",
      penetrationMultiplier: 1,
      shadowBaseLossDb: 24,
      shadowObstructionMultiplier: 3.4,
      shadowDistanceMultiplier: 1.2,
      maxShadowExtraDb: 42,
    };
  }
  return {
    band: "shf",
    penetrationMultiplier: 1.35,
    shadowBaseLossDb: 32,
    shadowObstructionMultiplier: 4.2,
    shadowDistanceMultiplier: 1.7,
    maxShadowExtraDb: 56,
  };
}

function buildingStructurePenalty(terrainProfile, frequencyMHz, terrain) {
  if (!terrain?.osmBuildingsEnabled) {
    return 0;
  }
  const bandProfile = getBuildingBandProfile(frequencyMHz);
  if (!bandProfile) {
    return 0;
  }
  if (!terrainProfile || terrainProfile.buildingHitSamples <= 0 || terrainProfile.buildingPathMeters <= 0) {
    return 0;
  }

  const presets = {
    "light-frame": { entryLossDb: 6, lossPerMeterDb: 0.8, maxAdditionalLossDb: 18 },
    brick: { entryLossDb: 10, lossPerMeterDb: 1.3, maxAdditionalLossDb: 24 },
    "reinforced-concrete": { entryLossDb: 16, lossPerMeterDb: 2.1, maxAdditionalLossDb: 34 },
    "steel-glass": { entryLossDb: 18, lossPerMeterDb: 2.6, maxAdditionalLossDb: 38 },
  };
  const preset = presets[terrain.buildingMaterialPreset] ?? presets["reinforced-concrete"];
  const effectivePathMeters = Math.min(terrainProfile.buildingPathMeters, 12);
  const obstructionFactor = clamp(terrainProfile.maxBuildingObstructionM / 10, 0.35, 1);
  const penetrationLossDb = (preset.entryLossDb + effectivePathMeters * preset.lossPerMeterDb)
    * obstructionFactor
    * bandProfile.penetrationMultiplier;
  if (!terrainProfile.buildingLineOfSightBlocked) {
    return Math.min(penetrationLossDb, preset.maxAdditionalLossDb);
  }

  const shadowLossDb = bandProfile.shadowBaseLossDb
    + terrainProfile.maxBuildingObstructionM * bandProfile.shadowObstructionMultiplier
    + effectivePathMeters * bandProfile.shadowDistanceMultiplier;
  const totalLossDb = penetrationLossDb + shadowLossDb;
  return Math.min(totalLossDb, preset.maxAdditionalLossDb + bandProfile.maxShadowExtraDb);
}

function diffractionPenalty(maxObstructionM, distanceKm, frequencyMHz) {
  if (maxObstructionM <= 0) {
    return 0;
  }

  const wavelengthM = 300 / Math.max(frequencyMHz, 0.1);
  const effectiveDistanceM = Math.max(distanceKm * 1000, 1);
  const v = maxObstructionM * Math.sqrt((2 / wavelengthM) * (2 / effectiveDistanceM));
  if (v <= -0.78) {
    return 0;
  }
  return 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1);
}

function atmosphericAttenuation(freqMHz, weather, distanceKm) {
  const freqGHz = Math.max(freqMHz, 1) / 1000;
  const humidityFactor = (weather.humidity / 100) * 0.18;
  const pressureFactor = weather.pressureHpa / 1013.25;
  const tempFactor = 293.15 / (weather.temperatureC + 273.15);
  const oxygenLoss = freqGHz * 0.012 * pressureFactor;
  const waterVaporLoss = freqGHz * humidityFactor * tempFactor;
  const windNoise = weather.windSpeedMps * 0.002;
  return Math.max(0, (oxygenLoss + waterVaporLoss + windNoise) * distanceKm);
}

function freeSpacePathLoss(distanceKm, frequencyMHz) {
  return 32.44 + 20 * Math.log10(Math.max(distanceKm, 0.001)) + 20 * Math.log10(Math.max(frequencyMHz, 0.1));
}

function wattsToDbm(watts) {
  return 10 * Math.log10(Math.max(watts, 0.000001) * 1000);
}

function resolveTerrain(terrainId) {
  if (!terrainId) {
    return null;
  }
  return terrainCache.get(terrainId) ?? null;
}

function polygonBounds(polygon) {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < polygon.length; index += 1) {
    const point = polygon[index];
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLon = Math.min(minLon, point.lon);
    maxLon = Math.max(maxLon, point.lon);
  }

  return { minLat, maxLat, minLon, maxLon };
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].lon;
    const yi = polygon[i].lat;
    const xj = polygon[j].lon;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function normalizedSignal(rssiDbm) {
  return clamp(rssiDbm, -130, -40) + 130;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersToLatitudeDegrees(meters) {
  return meters / 111320;
}

function metersToLongitudeDegrees(meters, lat) {
  return meters / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
}

function earthCurvatureDropMeters(distanceKm) {
  return (distanceKm * 1000) ** 2 / (2 * 6371000);
}

function bilinear(q11, q21, q12, q22, xRatio, yRatio) {
  return (
    q11 * (1 - xRatio) * (1 - yRatio) +
    q21 * xRatio * (1 - yRatio) +
    q12 * (1 - xRatio) * yRatio +
    q22 * xRatio * yRatio
  );
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
