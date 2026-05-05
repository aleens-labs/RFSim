use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

thread_local! {
    static TERRAIN_CACHE: RefCell<HashMap<String, TerrainGrid>> = RefCell::new(HashMap::new());
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Origin {
    lat: f64,
    lon: f64,
}

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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PathPoint {
    lat: f64,
    lon: f64,
}

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

fn default_temperature_c() -> f64 { 20.0 }
fn default_humidity() -> f64 { 50.0 }
fn default_pressure_hpa() -> f64 { 1013.2 }
fn default_wind_speed_mps() -> f64 { 3.0 }
fn default_building_material() -> String { "reinforced-concrete".to_string() }

#[wasm_bindgen]
pub fn engine_version() -> String {
    "0.1.0".to_string()
}

#[wasm_bindgen]
pub fn clear_compute_caches() {}

#[wasm_bindgen]
pub fn clear_terrain_cache() {
    TERRAIN_CACHE.with(|cache| cache.borrow_mut().clear());
}

#[wasm_bindgen]
pub fn remove_terrain(id: String) {
    TERRAIN_CACHE.with(|cache| {
        cache.borrow_mut().remove(&id);
    });
}

#[wasm_bindgen]
pub fn cache_terrain(terrain: JsValue) -> Result<(), JsValue> {
    let terrain: TerrainGrid = serde_wasm_bindgen::from_value(terrain)
        .map_err(|err| JsValue::from_str(&format!("terrain decode failed: {err}")))?;
    TERRAIN_CACHE.with(|cache| {
        cache.borrow_mut().insert(terrain.id.clone(), terrain);
    });
    Ok(())
}

#[wasm_bindgen]
pub fn sample_terrain_field(terrain_id: String, field_name: String, lat: f64, lon: f64) -> Result<JsValue, JsValue> {
    let value = with_terrain(&terrain_id, |terrain| sample_terrain_field_inner(lat, lon, terrain, &field_name))?;
    match value {
        Some(value) => Ok(JsValue::from_f64(value)),
        None => Ok(JsValue::NULL),
    }
}

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

fn uses_terrain_effects(propagation_model: &str) -> bool {
    matches!(propagation_model, "itu-p526" | "itu-hybrid" | "itu-buildings-weather")
}

fn uses_atmospheric_effects(propagation_model: &str) -> bool {
    matches!(propagation_model, "itu-hybrid" | "itu-buildings-weather")
}

fn uses_building_effects(propagation_model: &str) -> bool {
    propagation_model == "itu-buildings-weather"
}

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

fn get_terrain_field_source<'a>(terrain: &'a TerrainGrid, field_name: &str) -> &'a [f64] {
    if field_name == "baseElevations" {
        if let Some(base) = &terrain.base_elevations {
            return base.as_slice();
        }
    }
    terrain.elevations.as_slice()
}

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

fn sample_terrain(lat: f64, lon: f64, terrain: &TerrainGrid) -> Option<f64> {
    sample_terrain_field_inner(lat, lon, terrain, "elevations")
}

fn sample_terrain_base(lat: f64, lon: f64, terrain: &TerrainGrid) -> Option<f64> {
    sample_terrain_field_inner(lat, lon, terrain, "baseElevations")
}

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

fn free_space_path_loss(distance_km: f64, frequency_mhz: f64) -> f64 {
    32.44 + 20.0 * distance_km.max(0.001).log10() + 20.0 * frequency_mhz.max(0.1).log10()
}

fn watts_to_dbm(watts: f64) -> f64 {
    10.0 * (watts.max(0.000001) * 1000.0).log10()
}

fn estimate_trace_sample_meters(terrain: &TerrainGrid, latitude: f64) -> f64 {
    let lat_meters = terrain.lat_step_deg.abs() * 111_320.0;
    let lon_meters = terrain.lon_step_deg.abs() * 111_320.0 * latitude.to_radians().cos().max(1e-6);
    let cell_meters = lat_meters.min(lon_meters).max(1.0);
    clamp(cell_meters / 3.0, 8.0, 40.0)
}

fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let rad = std::f64::consts::PI / 180.0;
    let d_lat = (lat2 - lat1) * rad;
    let d_lon = (lon2 - lon1) * rad;
    let a = (d_lat / 2.0).sin().powi(2)
        + (lat1 * rad).cos() * (lat2 * rad).cos() * (d_lon / 2.0).sin().powi(2);
    6371.0 * 2.0 * a.sqrt().atan2((1.0 - a).sqrt())
}

fn earth_curvature_drop_meters(distance_km: f64) -> f64 {
    (distance_km * 1000.0).powi(2) / (2.0 * 6_371_000.0)
}

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}
