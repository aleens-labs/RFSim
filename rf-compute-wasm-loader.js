async function importWasmModule() {
  const moduleUrl = new URL("./rust/rf_sim_compute/pkg/rf_sim_compute.js", window.location.href).toString();
  return await import(/* @vite-ignore */ moduleUrl);
}

export async function loadRfComputeEngine() {
  try {
    const mod = await importWasmModule();
    if (typeof mod.default === "function") {
      await mod.default();
    }

    if (typeof mod.sample_terrain_field !== "function"
      || typeof mod.trace_terrain !== "function"
      || typeof mod.simulate_link !== "function"
      || typeof mod.build_path_profile !== "function") {
      return {
        kind: "js-fallback",
        version: "js",
        error: "WASM module loaded, but required exports were missing.",
      };
    }

    return {
      kind: "wasm",
      version: typeof mod.engine_version === "function" ? mod.engine_version() : "unknown",
      cacheTerrain(terrain) {
        return mod.cache_terrain(terrain);
      },
      removeTerrain(id) {
        return mod.remove_terrain(id);
      },
      clearTerrainCache() {
        return mod.clear_terrain_cache();
      },
      clearComputationCaches() {
        return typeof mod.clear_compute_caches === "function"
          ? mod.clear_compute_caches()
          : undefined;
      },
      sampleTerrainField(terrainId, fieldName, lat, lon) {
        return mod.sample_terrain_field(terrainId, fieldName, lat, lon);
      },
      traceTerrain(terrainId, source, target, txHeightM, rxHeightM) {
        return mod.trace_terrain(terrainId, source, target, txHeightM, rxHeightM);
      },
      simulateLink(terrainId, txAsset, rxTarget, weather, propagationModel) {
        return mod.simulate_link(terrainId, txAsset, rxTarget, weather, propagationModel);
      },
      buildPathProfile(terrainId, source, target, weather, propagationModel, clearancePolicy) {
        return mod.build_path_profile(terrainId, source, target, weather, propagationModel, clearancePolicy);
      },
    };
  } catch (error) {
    return {
      kind: "js-fallback",
      version: "js",
      error: error instanceof Error ? error.message : "Unknown WASM load failure.",
    };
  }
}
