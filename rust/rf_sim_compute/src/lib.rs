use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

thread_local! {
    static TERRAIN_CACHE: RefCell<HashMap<String, TerrainGrid>> = RefCell::new(HashMap::new());
}

/// Latitude/longitude origin of a cached terrain raster.
///
/// Inputs are deserialized from the JS/WASM boundary in decimal degrees.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Origin {
    lat: f64,
    lon: f64,
}

/// Terrain raster plus optional base-surface and building overlays used by the RF engine.
///
/// The grid is assumed to be rectilinear in latitude/longitude space with row/column spacing
/// expressed in degrees.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerrainGrid {
    id: String,
    rows: usize,
    cols: usize,
    origin: Origin,
    lat_step_deg: f64,
    lon_step_deg: f64,
    elevations: Vec<f64>,
    #[serde(default)]
    base_elevations: Option<Vec<f64>>,
    #[serde(default)]
    nodata_mask: Option<Vec<u8>>,
    #[serde(default)]
    osm_buildings_enabled: bool,
    #[serde(default = "default_building_material")]
    building_material_preset: String,
}

/// RF endpoint passed in from JS for link, terrain-trace, and path-profile calculations.
///
/// Coordinates are decimal degrees. RF parameters are optional so callers can omit values and
/// let the engine fall back to scenario defaults.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Endpoint {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    lat: f64,
    lon: f64,
    #[serde(default)]
    frequency_mhz: Option<f64>,
    #[serde(default)]
    power_w: Option<f64>,
    #[serde(default)]
    antenna_height_m: Option<f64>,
    #[serde(default)]
    antenna_gain_dbi: Option<f64>,
    #[serde(default)]
    receiver_gain_dbi: Option<f64>,
    #[serde(default)]
    receiver_sensitivity_dbm: Option<f64>,
    #[serde(default)]
    system_loss_db: Option<f64>,
    #[serde(default)]
    asset_type: Option<String>,
    #[serde(default)]
    ground_elevation_m: Option<f64>,
}

/// Weather inputs used by the atmospheric-loss approximation path.
///
/// Values are interpreted as Celsius, percent relative humidity, hectopascals, and meters/second.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WeatherModel {
    #[serde(default = "default_temperature_c")]
    temperature_c: f64,
    #[serde(default = "default_humidity")]
    humidity: f64,
    #[serde(default = "default_pressure_hpa")]
    pressure_hpa: f64,
    #[serde(default = "default_wind_speed_mps")]
    wind_speed_mps: f64,
}

/// Output of the terrain line-of-sight sweep between two endpoints.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TraceTerrainResult {
    line_of_sight: bool,
    max_obstruction_m: f64,
    building_path_meters: f64,
    building_hit_samples: usize,
    max_building_obstruction_m: f64,
    building_line_of_sight_blocked: bool,
    terrain_completeness: String,
}

/// Output of the simplified RF link simulation path.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulateLinkResult {
    distance_km: f64,
    path_loss_db: f64,
    line_of_sight: bool,
    max_obstruction_m: f64,
    terrain_completeness: String,
    building_loss_db: f64,
    building_path_meters: f64,
    building_hit_samples: usize,
    rssi_dbm: f64,
}

/// Geographic point returned for the worst path-profile location.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PathPoint {
    lat: f64,
    lon: f64,
}

/// Detailed path-profile result for clearance, Fresnel, and fade-margin inspection.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildPathProfileResult {
    distance_km: f64,
    geometric_los_clear: bool,
    fresnel_clear: bool,
    passes_policy: bool,
    min_clearance_m: f64,
    min_fresnel_clearance_m: f64,
    building_blocked: bool,
    path_loss_db: f64,
    rssi_dbm: f64,
    fade_margin_db: f64,
    required_extra_tx_height_m: f64,
    required_extra_rx_height_m: f64,
    worst_point: Option<PathPoint>,
}

/// Returns the default ambient temperature used when weather is omitted.
///
/// Inputs: none.
/// Reference: project-local default value, not an external algorithm.
fn default_temperature_c() -> f64 { 20.0 }

/// Returns the default relative humidity used when weather is omitted.
///
/// Inputs: none.
/// Reference: project-local default value, not an external algorithm.
fn default_humidity() -> f64 { 50.0 }

/// Returns the default pressure used when weather is omitted.
///
/// Inputs: none.
/// Reference: project-local default value, not an external algorithm.
fn default_pressure_hpa() -> f64 { 1013.2 }

/// Returns the default wind speed used when weather is omitted.
///
/// Inputs: none.
/// Reference: project-local default value, not an external algorithm.
fn default_wind_speed_mps() -> f64 { 3.0 }

/// Returns the fallback building-material preset used by the building loss heuristic.
///
/// Inputs: none.
/// Reference: project-local default value, not an external algorithm.
fn default_building_material() -> String { "reinforced-concrete".to_string() }

/// Returns the compute engine version string exposed to JS callers.
///
/// Inputs: none.
/// Reference: project-local API metadata, not an external algorithm.
#[wasm_bindgen]
pub fn engine_version() -> String {
    "0.1.0".to_string()
}

/// Placeholder cache-clear entrypoint kept for JS API compatibility.
///
/// Inputs: none.
/// Side effects: currently none.
/// Reference: project-local compatibility shim.
#[wasm_bindgen]
pub fn clear_compute_caches() {}

/// Clears every cached terrain grid from the in-memory WASM terrain cache.
///
/// Inputs: none.
/// Side effects: empties `TERRAIN_CACHE`.
/// Reference: project-local cache-management helper.
#[wasm_bindgen]
pub fn clear_terrain_cache() {
    TERRAIN_CACHE.with(|cache| cache.borrow_mut().clear());
}

/// Removes a single cached terrain grid by terrain id.
///
/// Inputs:
/// - `id`: cache key previously supplied in `cache_terrain`.
/// Side effects: deletes the matching cache entry when present.
/// Reference: project-local cache-management helper.
#[wasm_bindgen]
pub fn remove_terrain(id: String) {
    TERRAIN_CACHE.with(|cache| {
        cache.borrow_mut().remove(&id);
    });
}

/// Deserializes a JS terrain object and stores it in the in-memory terrain cache.
///
/// Inputs:
/// - `terrain`: JS object matching `TerrainGrid`.
/// Output: `Ok(())` on success or a JS error if decoding fails.
/// Reference: project-local WASM boundary and cache-ingest path.
#[wasm_bindgen]
pub fn cache_terrain(terrain: JsValue) -> Result<(), JsValue> {
    let terrain: TerrainGrid = serde_wasm_bindgen::from_value(terrain)
        .map_err(|err| JsValue::from_str(&format!("terrain decode failed: {err}")))?;
    TERRAIN_CACHE.with(|cache| {
        cache.borrow_mut().insert(terrain.id.clone(), terrain);
    });
    Ok(())
}

/// Samples one terrain field at the requested latitude/longitude.
///
/// Inputs:
/// - `terrain_id`: cached terrain key.
/// - `field_name`: `"elevations"` or `"baseElevations"`.
/// - `lat`, `lon`: decimal-degree sample coordinates.
/// Output: interpolated field value or `null` when the point is outside the grid or all nearby
/// samples are invalid.
/// Reference: delegates to `sample_terrain_field_inner`, which uses bilinear interpolation on the
/// rectilinear raster grid. For the interpolation method itself, see NIST Dataplot's bilinear
/// interpolation reference:
/// https://www.itl.nist.gov/div898/software/dataplot/refman2/ch3/bilinter.pdf
#[wasm_bindgen]
pub fn sample_terrain_field(terrain_id: String, field_name: String, lat: f64, lon: f64) -> Result<JsValue, JsValue> {
    let value = with_terrain(&terrain_id, |terrain| sample_terrain_field_inner(lat, lon, terrain, &field_name))?;
    match value {
        Some(value) => Ok(JsValue::from_f64(value)),
        None => Ok(JsValue::NULL),
    }
}

/// Computes terrain/building line-of-sight between two endpoints over a cached terrain grid.
///
/// Inputs:
/// - `terrain_id`: cached terrain key.
/// - `source`, `target`: JS endpoint objects decoded into `Endpoint`.
/// - `tx_height_m`, `rx_height_m`: antenna heights above sampled ground.
/// Output: serialized `TraceTerrainResult`.
/// Reference: delegates to `trace_terrain_inner`, a project-local terrain sweep that combines
/// great-circle spacing, linear interpolation along the path, and spherical-Earth curvature.
#[wasm_bindgen]
pub fn trace_terrain(
    terrain_id: String,
    source: JsValue,
    target: JsValue,
    tx_height_m: f64,
    rx_height_m: f64,
) -> Result<JsValue, JsValue> {
    let source: Endpoint = serde_wasm_bindgen::from_value(source)
        .map_err(|err| JsValue::from_str(&format!("source decode failed: {err}")))?;
    let target: Endpoint = serde_wasm_bindgen::from_value(target)
        .map_err(|err| JsValue::from_str(&format!("target decode failed: {err}")))?;
    let result = with_terrain(&terrain_id, |terrain| trace_terrain_inner(&source, &target, tx_height_m, rx_height_m, terrain))?;
    serde_wasm_bindgen::to_value(&result).map_err(|err| JsValue::from_str(&format!("trace encode failed: {err}")))
}

/// Simulates a single RF link between two endpoints, optionally using cached terrain.
///
/// Inputs:
/// - `terrain_id`: cached terrain key, or an empty string to disable terrain lookup.
/// - `tx_asset`, `rx_target`: JS endpoint objects decoded into `Endpoint`.
/// - `weather`: JS weather object decoded into `WeatherModel`.
/// - `propagation_model`: model selector such as `itu-p526`, `itu-hybrid`, or
///   `itu-buildings-weather`.
/// Output: serialized `SimulateLinkResult`.
/// Reference: delegates to `simulate_link_inner`, which combines free-space loss with optional
/// diffraction, atmospheric, and building-loss terms.
#[wasm_bindgen]
pub fn simulate_link(
    terrain_id: String,
    tx_asset: JsValue,
    rx_target: JsValue,
    weather: JsValue,
    propagation_model: String,
) -> Result<JsValue, JsValue> {
    let tx_asset: Endpoint = serde_wasm_bindgen::from_value(tx_asset)
        .map_err(|err| JsValue::from_str(&format!("tx decode failed: {err}")))?;
    let rx_target: Endpoint = serde_wasm_bindgen::from_value(rx_target)
        .map_err(|err| JsValue::from_str(&format!("rx decode failed: {err}")))?;
    let weather: WeatherModel = serde_wasm_bindgen::from_value(weather)
        .map_err(|err| JsValue::from_str(&format!("weather decode failed: {err}")))?;
    let result = with_optional_terrain(&terrain_id, |terrain| {
        simulate_link_inner(&tx_asset, &rx_target, terrain, &weather, &propagation_model)
    })?;
    serde_wasm_bindgen::to_value(&result).map_err(|err| JsValue::from_str(&format!("simulate encode failed: {err}")))
}

/// Builds a detailed path profile between two endpoints for LOS/Fresnel inspection.
///
/// Inputs:
/// - `terrain_id`: cached terrain key, or an empty string to run without terrain.
/// - `source`, `target`: JS endpoint objects decoded into `Endpoint`.
/// - `weather`: JS weather object decoded into `WeatherModel`.
/// - `propagation_model`: RF loss model selector.
/// - `clearance_policy`: policy selector such as geometric LOS, 60% Fresnel, or 100% Fresnel.
/// Output: serialized `BuildPathProfileResult`.
/// Reference: delegates to `build_path_profile_inner`, which performs a sampled profile sweep and
/// first-Fresnel clearance check before reusing `simulate_link_inner` for path loss and RSSI.
#[wasm_bindgen]
pub fn build_path_profile(
    terrain_id: String,
    source: JsValue,
    target: JsValue,
    weather: JsValue,
    propagation_model: String,
    clearance_policy: String,
) -> Result<JsValue, JsValue> {
    let source: Endpoint = serde_wasm_bindgen::from_value(source)
        .map_err(|err| JsValue::from_str(&format!("source decode failed: {err}")))?;
    let target: Endpoint = serde_wasm_bindgen::from_value(target)
        .map_err(|err| JsValue::from_str(&format!("target decode failed: {err}")))?;
    let weather: WeatherModel = serde_wasm_bindgen::from_value(weather)
        .map_err(|err| JsValue::from_str(&format!("weather decode failed: {err}")))?;
    let result = with_optional_terrain(&terrain_id, |terrain| {
        build_path_profile_inner(&source, &target, terrain, &weather, &propagation_model, &clearance_policy)
    })?;
    serde_wasm_bindgen::to_value(&result).map_err(|err| JsValue::from_str(&format!("profile encode failed: {err}")))
}

/// Runs a closure with an optional cached terrain reference.
///
/// Inputs:
/// - `terrain_id`: cache key; an empty string means "no terrain".
/// - `f`: closure that accepts `Option<&TerrainGrid>`.
/// Output: closure result wrapped in `Result`.
/// Reference: project-local cache access helper.
fn with_optional_terrain<T, F>(terrain_id: &str, f: F) -> Result<T, JsValue>
where
    F: FnOnce(Option<&TerrainGrid>) -> T,
{
    TERRAIN_CACHE.with(|cache| {
        let cache = cache.borrow();
        let terrain = if terrain_id.is_empty() {
            None
        } else {
            cache.get(terrain_id)
        };
        Ok(f(terrain))
    })
}

/// Runs a closure with a required cached terrain reference.
///
/// Inputs:
/// - `terrain_id`: cache key that must already exist.
/// - `f`: closure that accepts `&TerrainGrid`.
/// Output: closure result or a JS error when the terrain id is missing.
/// Reference: project-local cache access helper.
fn with_terrain<T, F>(terrain_id: &str, f: F) -> Result<T, JsValue>
where
    F: FnOnce(&TerrainGrid) -> T,
{
    TERRAIN_CACHE.with(|cache| {
        let cache = cache.borrow();
        let terrain = cache
            .get(terrain_id)
            .ok_or_else(|| JsValue::from_str(&format!("terrain not cached: {terrain_id}")))?;
        Ok(f(terrain))
    })
}

/// Returns whether the selected propagation model should include terrain/diffraction effects.
///
/// Inputs:
/// - `propagation_model`: model selector string from the JS layer.
/// Output: `true` when terrain-aware penalties should be evaluated.
/// Reference: project-local model-selection policy.
fn uses_terrain_effects(propagation_model: &str) -> bool {
    matches!(propagation_model, "itu-p526" | "itu-hybrid" | "itu-buildings-weather")
}

/// Returns whether the selected propagation model should include atmospheric attenuation.
///
/// Inputs:
/// - `propagation_model`: model selector string from the JS layer.
/// Output: `true` when atmospheric-loss terms should be evaluated.
/// Reference: project-local model-selection policy.
fn uses_atmospheric_effects(propagation_model: &str) -> bool {
    matches!(propagation_model, "itu-hybrid" | "itu-buildings-weather")
}

/// Returns whether the selected propagation model should include building penalties.
///
/// Inputs:
/// - `propagation_model`: model selector string from the JS layer.
/// Output: `true` when building-loss terms should be evaluated.
/// Reference: project-local model-selection policy.
fn uses_building_effects(propagation_model: &str) -> bool {
    propagation_model == "itu-buildings-weather"
}

/// Checks whether one terrain sample can participate in interpolation.
///
/// Inputs:
/// - `terrain`: terrain metadata including optional nodata mask.
/// - `source`: field values being sampled.
/// - `index`: flattened cell index into `source`.
/// Output: `true` when the sample exists, is finite, and is not marked nodata.
/// Reference: project-local raster validation helper.
fn terrain_sample_is_valid(terrain: &TerrainGrid, source: &[f64], index: usize) -> bool {
    if let Some(value) = source.get(index) {
        if !value.is_finite() {
            return false;
        }
    } else {
        return false;
    }
    if let Some(mask) = &terrain.nodata_mask {
        return mask.get(index).copied().unwrap_or(0) != 1;
    }
    true
}

/// Selects which terrain field array to sample for a given field name.
///
/// Inputs:
/// - `terrain`: terrain grid holding the available field arrays.
/// - `field_name`: JS-visible field selector.
/// Output: slice of the chosen field values.
/// Reference: project-local field-dispatch helper.
fn get_terrain_field_source<'a>(terrain: &'a TerrainGrid, field_name: &str) -> &'a [f64] {
    if field_name == "baseElevations" {
        if let Some(base) = &terrain.base_elevations {
            return base.as_slice();
        }
    }
    terrain.elevations.as_slice()
}

/// Samples one terrain field by bilinear interpolation across the four surrounding raster cells.
///
/// Inputs:
/// - `lat`, `lon`: decimal-degree coordinates to sample.
/// - `terrain`: raster definition and field arrays.
/// - `field_name`: field selector resolved by `get_terrain_field_source`.
/// Output: interpolated value, or `None` when the point is outside the raster footprint or all
/// contributing samples are invalid.
/// Reference: standard bilinear interpolation on a rectilinear grid, adapted to a latitude/longitude
/// terrain raster with nodata masking. NIST summary:
/// https://www.itl.nist.gov/div898/software/dataplot/refman2/ch3/bilinter.pdf
fn sample_terrain_field_inner(lat: f64, lon: f64, terrain: &TerrainGrid, field_name: &str) -> Option<f64> {
    let row_float = (lat - terrain.origin.lat) / terrain.lat_step_deg;
    let col_float = (lon - terrain.origin.lon) / terrain.lon_step_deg;
    let row = row_float.floor() as isize;
    let col = col_float.floor() as isize;

    if row < 0 || col < 0 || row as usize >= terrain.rows.saturating_sub(1) || col as usize >= terrain.cols.saturating_sub(1) {
        return None;
    }

    let row = row as usize;
    let col = col as usize;
    let row_ratio = row_float - row as f64;
    let col_ratio = col_float - col as f64;
    let source = get_terrain_field_source(terrain, field_name);
    let corners = [
        ((1.0 - col_ratio) * (1.0 - row_ratio), row * terrain.cols + col),
        (col_ratio * (1.0 - row_ratio), row * terrain.cols + col + 1),
        ((1.0 - col_ratio) * row_ratio, (row + 1) * terrain.cols + col),
        (col_ratio * row_ratio, (row + 1) * terrain.cols + col + 1),
    ];

    let mut weighted = 0.0;
    let mut total_weight = 0.0;
    for (weight, index) in corners {
        if !terrain_sample_is_valid(terrain, source, index) {
            continue;
        }
        weighted += source[index] * weight;
        total_weight += weight;
    }

    if total_weight <= 0.0 {
        None
    } else {
        Some(weighted / total_weight)
    }
}

/// Samples the active terrain surface elevation at one point.
///
/// Inputs:
/// - `lat`, `lon`: decimal-degree sample location.
/// - `terrain`: terrain raster.
/// Output: interpolated terrain surface elevation.
/// Reference: thin wrapper over bilinear raster sampling.
fn sample_terrain(lat: f64, lon: f64, terrain: &TerrainGrid) -> Option<f64> {
    sample_terrain_field_inner(lat, lon, terrain, "elevations")
}

/// Samples the base terrain elevation before building overlays are applied.
///
/// Inputs:
/// - `lat`, `lon`: decimal-degree sample location.
/// - `terrain`: terrain raster.
/// Output: interpolated base-surface elevation.
/// Reference: thin wrapper over bilinear raster sampling.
fn sample_terrain_base(lat: f64, lon: f64, terrain: &TerrainGrid) -> Option<f64> {
    sample_terrain_field_inner(lat, lon, terrain, "baseElevations")
}

/// Samples the effective obstructing surface used for LOS tests.
///
/// Inputs:
/// - `lat`, `lon`: decimal-degree sample location.
/// - `terrain`: terrain raster and optional building-overlay settings.
/// Output: maximum sampled obstruction height near the requested point.
/// Reference:
/// - Base terrain comes from bilinear raster sampling.
/// - The surrounding-point max search is a project-local heuristic meant to avoid undersampling
///   narrow building footprints within coarse cells.
fn sample_surface_obstruction(lat: f64, lon: f64, terrain: &TerrainGrid) -> Option<f64> {
    if !terrain.osm_buildings_enabled {
        return sample_terrain(lat, lon, terrain);
    }

    let cell_lat_offset = terrain.lat_step_deg.abs() * 0.42;
    let cell_lon_offset = terrain.lon_step_deg.abs() * 0.42;
    let sample_points = [
        (lat, lon),
        (lat + cell_lat_offset, lon),
        (lat - cell_lat_offset, lon),
        (lat, lon + cell_lon_offset),
        (lat, lon - cell_lon_offset),
        (lat + cell_lat_offset * 0.7, lon + cell_lon_offset * 0.7),
        (lat + cell_lat_offset * 0.7, lon - cell_lon_offset * 0.7),
        (lat - cell_lat_offset * 0.7, lon + cell_lon_offset * 0.7),
        (lat - cell_lat_offset * 0.7, lon - cell_lon_offset * 0.7),
    ];

    let mut max_height = sample_terrain(lat, lon, terrain);
    for (sample_lat, sample_lon) in sample_points {
        if let Some(sampled) = sample_terrain(sample_lat, sample_lon, terrain) {
            max_height = Some(match max_height {
                Some(current) => current.max(sampled),
                None => sampled,
            });
        }
    }
    max_height
}

/// Walks the path between two endpoints and measures terrain/building obstruction against the LOS ray.
///
/// Inputs:
/// - `source`, `target`: RF endpoints in decimal degrees.
/// - `tx_height_m`, `rx_height_m`: antenna heights above local ground.
/// - `terrain`: terrain/building raster used for sampling.
/// Output: `TraceTerrainResult` containing LOS status, obstruction depth, building-hit statistics,
/// and terrain coverage completeness.
/// Reference:
/// - Distance spacing uses `haversine_km`, the standard great-circle haversine relation.
/// - LOS height uses linear interpolation along the path.
/// - Earth bulge correction uses the spherical-Earth sag approximation in `earth_curvature_drop_meters`.
/// - The overall sweep and building-hit bookkeeping are project-local RF-planning logic.
/// - Great-circle / haversine background:
///   https://dtcenter.org/sites/default/files/community-code/met/docs/write-ups/gc_simple.pdf
fn trace_terrain_inner(source: &Endpoint, target: &Endpoint, tx_height_m: f64, rx_height_m: f64, terrain: &TerrainGrid) -> TraceTerrainResult {
    let total_distance_km = haversine_km(source.lat, source.lon, target.lat, target.lon);
    let total_distance_meters = total_distance_km * 1000.0;
    let trace_sample_meters = estimate_trace_sample_meters(terrain, (source.lat + target.lat) / 2.0);
    let steps = usize::max(24, (total_distance_meters / trace_sample_meters).ceil() as usize);
    let source_ground = sample_terrain(source.lat, source.lon, terrain).unwrap_or(0.0);
    let target_ground = sample_terrain(target.lat, target.lon, terrain).unwrap_or(0.0);
    let source_alt = source_ground + tx_height_m;
    let target_alt = target_ground + rx_height_m;
    let step_distance_meters = total_distance_meters / steps as f64;

    let mut max_obstruction_m = 0.0;
    let mut building_path_meters = 0.0;
    let mut building_hit_samples = 0usize;
    let mut max_building_obstruction_m: f64 = 0.0;
    let mut sampled_count = 0usize;

    for step in 1..steps {
      let t = step as f64 / steps as f64;
      let lat = lerp(source.lat, target.lat, t);
      let lon = lerp(source.lon, target.lon, t);
      let Some(terrain_height) = sample_surface_obstruction(lat, lon, terrain) else {
          continue;
      };
      let base_height = sample_terrain_base(lat, lon, terrain).unwrap_or(terrain_height);
      sampled_count += 1;
      let los_height = lerp(source_alt, target_alt, t);
      let earth_curve_drop = earth_curvature_drop_meters(total_distance_km * t);
      let obstruction = terrain_height - (los_height - earth_curve_drop);
      if obstruction > max_obstruction_m {
          max_obstruction_m = obstruction;
      }
      let building_height = (terrain_height - base_height).max(0.0);
      if building_height > 2.0 && obstruction > 0.0 {
          building_path_meters += step_distance_meters;
          building_hit_samples += 1;
          max_building_obstruction_m = max_building_obstruction_m.max(obstruction.min(building_height));
      }
    }

    let terrain_completeness = if sampled_count == steps.saturating_sub(1) {
        "full"
    } else if sampled_count > 0 {
        "partial"
    } else {
        "none"
    }.to_string();

    TraceTerrainResult {
        line_of_sight: if terrain_completeness == "none" { true } else { max_obstruction_m <= 0.0 },
        max_obstruction_m: max_obstruction_m.max(0.0),
        building_path_meters,
        building_hit_samples,
        max_building_obstruction_m,
        building_line_of_sight_blocked: max_building_obstruction_m > 0.5,
        terrain_completeness,
    }
}

/// Simulates an RF link budget with optional terrain, atmospheric, diffraction, and building effects.
///
/// Inputs:
/// - `tx_asset`, `rx_target`: transmit and receive endpoints.
/// - `terrain`: optional terrain raster for terrain-aware models.
/// - `weather`: weather parameters used by the atmospheric-loss approximation.
/// - `propagation_model`: model selector controlling which penalty terms are enabled.
/// Output: `SimulateLinkResult` with distance, path loss, LOS state, and RSSI.
/// Reference:
/// - Free-space loss uses the standard Friis/FSPL log-distance form via `free_space_path_loss`.
///   See Shaw, "Radiometry and the Friis transmission equation" (Am. J. Phys. 81, 33, 2013):
///   https://www.montana.edu/jshaw/documents/RadiometryFriis%20Eqn%20-%20Shaw%20-%20AJP%202013.pdf
/// - Diffraction uses the knife-edge excess-loss form in `diffraction_penalty`, aligned to ITU-R P.526 style handling:
///   https://www.itu.int/rec/r-rec-p.526/en
/// - Atmospheric attenuation uses a project-local approximation inspired by atmospheric gas loss models rather than a direct implementation of a full ITU recommendation.
/// - Building penalties are project-local heuristics layered on top of the terrain trace.
fn simulate_link_inner(
    tx_asset: &Endpoint,
    rx_target: &Endpoint,
    terrain: Option<&TerrainGrid>,
    weather: &WeatherModel,
    propagation_model: &str,
) -> SimulateLinkResult {
    let distance_km = haversine_km(tx_asset.lat, tx_asset.lon, rx_target.lat, rx_target.lon);
    let include_terrain = uses_terrain_effects(propagation_model);
    let include_atmosphere = uses_atmospheric_effects(propagation_model);
    let include_buildings = uses_building_effects(propagation_model);
    let terrain_profile = if include_terrain {
        terrain
            .map(|terrain| {
                trace_terrain_inner(
                    tx_asset,
                    rx_target,
                    tx_asset.antenna_height_m.unwrap_or(0.0),
                    rx_target.antenna_height_m.unwrap_or(0.0),
                    terrain,
                )
            })
            .unwrap_or(TraceTerrainResult {
                line_of_sight: true,
                max_obstruction_m: 0.0,
                building_path_meters: 0.0,
                building_hit_samples: 0,
                max_building_obstruction_m: 0.0,
                building_line_of_sight_blocked: false,
                terrain_completeness: "none".to_string(),
            })
    } else {
        TraceTerrainResult {
            line_of_sight: true,
            max_obstruction_m: 0.0,
            building_path_meters: 0.0,
            building_hit_samples: 0,
            max_building_obstruction_m: 0.0,
            building_line_of_sight_blocked: false,
            terrain_completeness: if terrain.is_some() { "full" } else { "none" }.to_string(),
        }
    };
    let frequency_mhz = tx_asset.frequency_mhz.unwrap_or(300.0);
    let free_space_db = free_space_path_loss(distance_km, frequency_mhz);
    let atmospheric_db = if include_atmosphere {
        atmospheric_attenuation(frequency_mhz, weather, distance_km)
    } else {
        0.0
    };
    let diffraction_db = if include_terrain {
        diffraction_penalty(terrain_profile.max_obstruction_m, distance_km, frequency_mhz)
    } else {
        0.0
    };
    let building_loss_db = if include_buildings {
        terrain
            .map(|terrain| building_structure_penalty(&terrain_profile, frequency_mhz, terrain))
            .unwrap_or(0.0)
    } else {
        0.0
    };

    let mut path_loss_db = free_space_db;
    if propagation_model == "itu-p526" {
        path_loss_db += diffraction_db;
    } else if propagation_model == "itu-hybrid" {
        path_loss_db += atmospheric_db + diffraction_db;
    } else if propagation_model == "itu-buildings-weather" {
        path_loss_db += atmospheric_db + diffraction_db + building_loss_db;
    }

    let tx_power_dbm = watts_to_dbm(tx_asset.power_w.unwrap_or(0.0));
    let tx_gain_db = tx_asset.antenna_gain_dbi.unwrap_or(0.0);
    let rx_gain_db = rx_target.receiver_gain_dbi.unwrap_or(0.0);
    let total_system_loss_db = tx_asset.system_loss_db.unwrap_or(0.0) + rx_target.system_loss_db.unwrap_or(0.0);
    let jammer_boost_db = if tx_asset.asset_type.as_deref() == Some("jammer") { 6.0 } else { 0.0 };
    let rssi_dbm = tx_power_dbm + tx_gain_db + rx_gain_db + jammer_boost_db - path_loss_db - total_system_loss_db;

    SimulateLinkResult {
        distance_km,
        path_loss_db,
        line_of_sight: terrain_profile.line_of_sight,
        max_obstruction_m: terrain_profile.max_obstruction_m,
        terrain_completeness: terrain_profile.terrain_completeness,
        building_loss_db,
        building_path_meters: terrain_profile.building_path_meters,
        building_hit_samples: terrain_profile.building_hit_samples,
        rssi_dbm,
    }
}

/// Builds a sampled path profile and evaluates geometric LOS, Fresnel clearance, and fade margin.
///
/// Inputs:
/// - `source`, `target`: profile endpoints.
/// - `terrain`: optional terrain raster.
/// - `weather`: weather inputs reused by the RF loss model.
/// - `propagation_model`: RF loss model selector.
/// - `clearance_policy`: policy controlling whether geometric LOS, 60% Fresnel, 100% Fresnel,
///   or building-aware clearance is required.
/// Output: `BuildPathProfileResult` containing worst-point location, clearances, pass/fail state,
/// path loss, RSSI, and extra mast height needed.
/// Reference:
/// - Path distance uses the haversine relation.
/// - Fresnel clearance uses the first Fresnel zone radius formula.
/// - Earth bulge correction uses a spherical-Earth curvature approximation.
/// - The policy evaluation and "extra height needed" logic are project-local decision rules.
/// - Great-circle / haversine background:
///   https://dtcenter.org/sites/default/files/community-code/met/docs/write-ups/gc_simple.pdf
fn build_path_profile_inner(
    source: &Endpoint,
    target: &Endpoint,
    terrain: Option<&TerrainGrid>,
    weather: &WeatherModel,
    propagation_model: &str,
    clearance_policy: &str,
) -> BuildPathProfileResult {
    let distance_km = haversine_km(source.lat, source.lon, target.lat, target.lon);
    let frequency_mhz = source.frequency_mhz.or(target.frequency_mhz).unwrap_or(300.0);
    let wavelength_m = 300.0 / frequency_mhz.max(0.1);
    let total_distance_meters = (distance_km * 1000.0).max(1.0);
    let tx_height_m = source.antenna_height_m.unwrap_or(2.0);
    let rx_height_m = target.antenna_height_m.unwrap_or(2.0);
    let source_ground = terrain.and_then(|terrain| sample_terrain(source.lat, source.lon, terrain)).unwrap_or(0.0);
    let target_ground = terrain.and_then(|terrain| sample_terrain(target.lat, target.lon, terrain)).unwrap_or(0.0);
    let source_alt = source_ground + tx_height_m;
    let target_alt = target_ground + rx_height_m;
    let trace_sample_meters = terrain
        .map(|terrain| estimate_trace_sample_meters(terrain, (source.lat + target.lat) / 2.0))
        .unwrap_or(30.0);
    let steps = usize::max(24, (total_distance_meters / trace_sample_meters).ceil() as usize);
    let step_distance_meters = total_distance_meters / steps as f64;
    let fresnel_fraction = if clearance_policy == "fresnel-100" {
        1.0
    } else if clearance_policy == "fresnel-60" || clearance_policy == "fresnel-60-buildings" {
        0.6
    } else {
        0.0
    };

    let mut min_clearance_m = f64::INFINITY;
    let mut min_fresnel_clearance_m = f64::INFINITY;
    let mut min_required_fresnel_clearance_m = f64::INFINITY;
    let mut max_obstruction_m = 0.0;
    let mut max_building_obstruction_m: f64 = 0.0;
    let mut building_hit_samples = 0usize;
    let mut building_path_meters = 0.0;
    let mut worst_point = None;

    for step in 1..steps {
        let t = step as f64 / steps as f64;
        let lat = lerp(source.lat, target.lat, t);
        let lon = lerp(source.lon, target.lon, t);
        let surface_height = terrain
            .and_then(|terrain| sample_surface_obstruction(lat, lon, terrain))
            .unwrap_or(0.0);
        let base_height = terrain
            .and_then(|terrain| sample_terrain_base(lat, lon, terrain))
            .unwrap_or(surface_height);
        let los_height = lerp(source_alt, target_alt, t);
        let earth_curve_drop = earth_curvature_drop_meters(distance_km * t);
        let clearance_m = (los_height - earth_curve_drop) - surface_height;
        let d1 = total_distance_meters * t;
        let d2 = total_distance_meters - d1;
        let fresnel_radius_m = ((wavelength_m * d1 * d2) / (d1 + d2).max(1.0)).max(0.0).sqrt();
        let fresnel_clearance_m = clearance_m - fresnel_radius_m;
        let required_fresnel_clearance_m = clearance_m - (fresnel_radius_m * fresnel_fraction);
        let obstruction = (surface_height - (los_height - earth_curve_drop)).max(0.0);
        let building_height = (surface_height - base_height).max(0.0);

        if clearance_m < min_clearance_m {
            min_clearance_m = clearance_m;
            worst_point = Some(PathPoint { lat, lon });
        }
        if fresnel_clearance_m < min_fresnel_clearance_m {
            min_fresnel_clearance_m = fresnel_clearance_m;
        }
        if required_fresnel_clearance_m < min_required_fresnel_clearance_m {
            min_required_fresnel_clearance_m = required_fresnel_clearance_m;
        }
        if obstruction > max_obstruction_m {
            max_obstruction_m = obstruction;
        }
        if building_height > 2.0 && obstruction > 0.0 {
            building_hit_samples += 1;
            building_path_meters += step_distance_meters;
            max_building_obstruction_m = max_building_obstruction_m.max(obstruction.min(building_height));
        }
    }

    let terrain_profile = TraceTerrainResult {
        line_of_sight: min_clearance_m > 0.0,
        max_obstruction_m: max_obstruction_m.max(0.0),
        building_path_meters,
        building_hit_samples,
        max_building_obstruction_m,
        building_line_of_sight_blocked: max_building_obstruction_m > 0.5,
        terrain_completeness: if terrain.is_some() { "full" } else { "none" }.to_string(),
    };
    let simulated = simulate_link_inner(source, target, terrain, weather, propagation_model);
    let fade_margin_db = simulated.rssi_dbm - target.receiver_sensitivity_dbm.unwrap_or(-95.0);
    let passes_buildings = clearance_policy != "fresnel-60-buildings" || !terrain_profile.building_line_of_sight_blocked;
    let passes_policy = min_clearance_m >= 0.0
        && (fresnel_fraction == 0.0 || min_required_fresnel_clearance_m >= 0.0)
        && passes_buildings;
    let geometric_deficit = (-(min_clearance_m) + 1.0).max(0.0);
    let fresnel_deficit = if fresnel_fraction > 0.0 {
        (-(min_required_fresnel_clearance_m) + 1.0).max(0.0)
    } else {
        0.0
    };
    let extra_height_needed = geometric_deficit.max(fresnel_deficit);

    BuildPathProfileResult {
        distance_km,
        geometric_los_clear: min_clearance_m >= 0.0,
        fresnel_clear: if fresnel_fraction == 0.0 { true } else { min_fresnel_clearance_m >= 0.0 },
        passes_policy,
        min_clearance_m: if min_clearance_m.is_finite() { min_clearance_m } else { 0.0 },
        min_fresnel_clearance_m: if min_fresnel_clearance_m.is_finite() { min_fresnel_clearance_m } else { 0.0 },
        building_blocked: terrain_profile.building_line_of_sight_blocked,
        path_loss_db: simulated.path_loss_db,
        rssi_dbm: simulated.rssi_dbm,
        fade_margin_db,
        required_extra_tx_height_m: extra_height_needed,
        required_extra_rx_height_m: extra_height_needed,
        worst_point,
    }
}

/// Returns frequency-band coefficients used by the building-loss heuristic.
///
/// Inputs:
/// - `frequency_mhz`: operating frequency in MHz.
/// Output: tuple of penetration/shadow coefficients, or `None` below the modeled range.
/// Reference: project-local band bucketing heuristic; the values are tuning constants rather than a
/// direct transcription of a single external standard.
fn get_building_band_profile(frequency_mhz: f64) -> Option<(f64, f64, f64, f64, f64)> {
    if frequency_mhz < 30.0 {
        None
    } else if frequency_mhz < 300.0 {
        Some((0.75, 16.0, 2.2, 0.7, 26.0))
    } else if frequency_mhz < 3000.0 {
        Some((1.0, 24.0, 3.4, 1.2, 42.0))
    } else {
        Some((1.35, 32.0, 4.2, 1.7, 56.0))
    }
}

/// Estimates additional building penetration and shadowing loss from the terrain trace.
///
/// Inputs:
/// - `terrain_profile`: obstruction statistics produced by `trace_terrain_inner`.
/// - `frequency_mhz`: operating frequency in MHz.
/// - `terrain`: terrain/building metadata, including the selected material preset.
/// Output: extra building loss in dB.
/// Reference:
/// - This is a project-specific heuristic model.
/// - It combines frequency-band scaling, material presets, obstruction depth, and building path
///   length rather than implementing a single named propagation recommendation verbatim.
fn building_structure_penalty(terrain_profile: &TraceTerrainResult, frequency_mhz: f64, terrain: &TerrainGrid) -> f64 {
    if !terrain.osm_buildings_enabled {
        return 0.0;
    }
    let Some((penetration_multiplier, shadow_base_loss_db, shadow_obstruction_multiplier, shadow_distance_multiplier, max_shadow_extra_db)) =
        get_building_band_profile(frequency_mhz)
    else {
        return 0.0;
    };
    if terrain_profile.building_hit_samples == 0 || terrain_profile.building_path_meters <= 0.0 {
        return 0.0;
    }

    let (entry_loss_db, loss_per_meter_db, max_additional_loss_db) = match terrain.building_material_preset.as_str() {
        "light-frame" => (6.0, 0.8, 18.0),
        "brick" => (10.0, 1.3, 24.0),
        "steel-glass" => (18.0, 2.6, 38.0),
        _ => (16.0, 2.1, 34.0),
    };
    let effective_path_meters = terrain_profile.building_path_meters.min(12.0);
    let obstruction_factor = clamp(terrain_profile.max_building_obstruction_m / 10.0, 0.35, 1.0);
    let penetration_loss_db =
        (entry_loss_db + effective_path_meters * loss_per_meter_db) * obstruction_factor * penetration_multiplier;
    if !terrain_profile.building_line_of_sight_blocked {
        return penetration_loss_db.min(max_additional_loss_db);
    }

    let shadow_loss_db = shadow_base_loss_db
        + terrain_profile.max_building_obstruction_m * shadow_obstruction_multiplier
        + effective_path_meters * shadow_distance_multiplier;
    let total_loss_db = penetration_loss_db + shadow_loss_db;
    total_loss_db.min(max_additional_loss_db + max_shadow_extra_db)
}

/// Computes excess diffraction loss from the maximum LOS obstruction height.
///
/// Inputs:
/// - `max_obstruction_m`: positive obstruction above the LOS ray in meters.
/// - `distance_km`: total path length in kilometers.
/// - `frequency_mhz`: operating frequency in MHz.
/// Output: diffraction penalty in dB.
/// Reference: single-knife-edge excess-loss equation using the `v` parameter, consistent with the
/// common ITU-R P.526 formulation:
/// https://www.itu.int/rec/r-rec-p.526/en
fn diffraction_penalty(max_obstruction_m: f64, distance_km: f64, frequency_mhz: f64) -> f64 {
    if max_obstruction_m <= 0.0 {
        return 0.0;
    }
    let wavelength_m = 300.0 / frequency_mhz.max(0.1);
    let effective_distance_m = (distance_km * 1000.0).max(1.0);
    let v = max_obstruction_m * ((2.0 / wavelength_m) * (2.0 / effective_distance_m)).sqrt();
    if v <= -0.78 {
        return 0.0;
    }
    6.9 + 20.0 * (((v - 0.1).powi(2) + 1.0).sqrt() + v - 0.1).log10()
}

/// Approximates atmospheric loss over the path using weather-weighted frequency scaling.
///
/// Inputs:
/// - `freq_mhz`: operating frequency in MHz.
/// - `weather`: temperature, humidity, pressure, and wind inputs.
/// - `distance_km`: total path length in kilometers.
/// Output: atmospheric attenuation in dB.
/// Reference:
/// - Inspired by atmospheric-gas attenuation modeling such as ITU-R P.676:
///   https://www.itu.int/rec/R-REC-p.676/en
/// - This implementation is intentionally simplified and should be treated as a project-local
///   approximation, not a full line-by-line implementation of the ITU method.
fn atmospheric_attenuation(freq_mhz: f64, weather: &WeatherModel, distance_km: f64) -> f64 {
    let freq_ghz = freq_mhz.max(1.0) / 1000.0;
    let humidity_factor = (weather.humidity / 100.0) * 0.18;
    let pressure_factor = weather.pressure_hpa / 1013.25;
    let temp_factor = 293.15 / (weather.temperature_c + 273.15);
    let oxygen_loss = freq_ghz * 0.012 * pressure_factor;
    let water_vapor_loss = freq_ghz * humidity_factor * temp_factor;
    let wind_noise = weather.wind_speed_mps * 0.002;
    ((oxygen_loss + water_vapor_loss + wind_noise) * distance_km).max(0.0)
}

/// Computes free-space path loss from range and frequency.
///
/// Inputs:
/// - `distance_km`: path length in kilometers.
/// - `frequency_mhz`: operating frequency in MHz.
/// Output: free-space path loss in dB.
/// Reference: standard FSPL expression commonly attributed to the Friis transmission relation,
/// using distance in km and frequency in MHz. Background reference:
/// https://www.montana.edu/jshaw/documents/RadiometryFriis%20Eqn%20-%20Shaw%20-%20AJP%202013.pdf
fn free_space_path_loss(distance_km: f64, frequency_mhz: f64) -> f64 {
    32.44 + 20.0 * distance_km.max(0.001).log10() + 20.0 * frequency_mhz.max(0.1).log10()
}

/// Converts transmit power from watts to dBm.
///
/// Inputs:
/// - `watts`: transmit power in watts.
/// Output: power in dBm, clamped away from zero to avoid log singularities.
/// Reference: standard logarithmic power conversion between watts and dBm.
fn watts_to_dbm(watts: f64) -> f64 {
    10.0 * (watts.max(0.000001) * 1000.0).log10()
}

/// Chooses path-trace sample spacing from the raster cell size at the current latitude.
///
/// Inputs:
/// - `terrain`: terrain grid whose angular cell size defines the sampling resolution.
/// - `latitude`: representative latitude used to convert longitude degrees to meters.
/// Output: sample spacing in meters.
/// Reference:
/// - Degree-to-meter conversion is standard geographic scaling.
/// - The final `cell/3`, min, and max clamps are project-local tuning for LOS sampling density.
fn estimate_trace_sample_meters(terrain: &TerrainGrid, latitude: f64) -> f64 {
    let lat_meters = terrain.lat_step_deg.abs() * 111_320.0;
    let lon_meters = terrain.lon_step_deg.abs() * 111_320.0 * latitude.to_radians().cos().max(1e-6);
    let cell_meters = lat_meters.min(lon_meters).max(1.0);
    clamp(cell_meters / 3.0, 8.0, 40.0)
}

/// Computes great-circle distance between two latitude/longitude points.
///
/// Inputs:
/// - `lat1`, `lon1`, `lat2`, `lon2`: decimal-degree coordinates.
/// Output: distance in kilometers.
/// Reference: haversine formula for spherical great-circle distance. Compact derivation/reference:
/// https://dtcenter.org/sites/default/files/community-code/met/docs/write-ups/gc_simple.pdf
fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let rad = std::f64::consts::PI / 180.0;
    let d_lat = (lat2 - lat1) * rad;
    let d_lon = (lon2 - lon1) * rad;
    let a = (d_lat / 2.0).sin().powi(2)
        + (lat1 * rad).cos() * (lat2 * rad).cos() * (d_lon / 2.0).sin().powi(2);
    6371.0 * 2.0 * a.sqrt().atan2((1.0 - a).sqrt())
}

/// Approximates Earth-curvature drop below a tangent line over a path segment.
///
/// Inputs:
/// - `distance_km`: horizontal distance from the path origin in kilometers.
/// Output: curvature sag in meters.
/// Reference: spherical-Earth approximation `d^2 / (2R)` for small-sag geometry.
fn earth_curvature_drop_meters(distance_km: f64) -> f64 {
    (distance_km * 1000.0).powi(2) / (2.0 * 6_371_000.0)
}

/// Linearly interpolates between two scalar values.
///
/// Inputs:
/// - `a`, `b`: endpoints.
/// - `t`: interpolation fraction, typically in `[0, 1]`.
/// Output: interpolated value.
/// Reference: standard linear interpolation helper.
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Clamps a scalar value into an inclusive numeric range.
///
/// Inputs:
/// - `value`: input scalar.
/// - `min`, `max`: lower and upper bounds.
/// Output: bounded value.
/// Reference: standard utility helper; project-local wrapper around `max/min`.
fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}
