const assert = require("node:assert/strict");
const test = require("node:test");

const sensorEvaluation = require("../src/sensor-evaluation.js");

const placedSensor = { lat: 34.25, lon: -115.97 };
const placedEmitter = { lat: 34.26, lon: -115.98 };

function baseSensor(overrides = {}) {
  return sensorEvaluation.normalizeSensorCapability({
    frequencyMinMHz: 100,
    frequencyMaxMHz: 200,
    instantaneousBandwidthMHz: 0.05,
    channels: 1,
    sensitivityDbm: -100,
    modes: "NFM, FM",
    ...overrides,
  });
}

function baseEmitter(overrides = {}) {
  return {
    id: "emitter-1",
    name: "PRC-163",
    frequencyMHz: 150,
    bandwidthKHz: 25,
    waveform: "FM voice",
    modulation: "FM",
    powerW: 5,
    ...overrides,
  };
}

function propagation(overrides = {}) {
  return {
    terrainId: "terrain-1",
    terrainSourceLabel: "DTED",
    terrainCompleteness: "full",
    propagationModel: "itu-hybrid",
    forwardSimulation: {
      rssiDbm: -70,
      distanceKm: 2,
      pathLossDb: 100,
      terrainCompleteness: "full",
    },
    forwardProfile: {
      distanceKm: 2,
      geometricLosClear: true,
      fresnelClear: true,
      passesPolicy: true,
      minClearanceM: 15,
      minFresnelClearanceM: 8,
    },
    ...overrides,
  };
}

test("frequency outside range rejects before propagation", () => {
  const result = sensorEvaluation.evaluateSensorEmission({
    sensor: baseSensor(),
    emitter: baseEmitter({ frequencyMHz: 250 }),
    sensorPosition: placedSensor,
    emitterPosition: placedEmitter,
    propagation: propagation(),
  });

  assert.equal(result.status, "out-of-range");
  assert.equal(result.energyDetected, false);
  assert.equal(result.rxDbm, null);
});

test("partial bandwidth overlap detects energy but blocks demod", () => {
  const result = sensorEvaluation.evaluateSensorEmission({
    sensor: baseSensor({ instantaneousBandwidthMHz: 0.5 }),
    emitter: baseEmitter({ frequencyMHz: 199.8, bandwidthKHz: 1000 }),
    sensorPosition: placedSensor,
    emitterPosition: placedEmitter,
    propagation: propagation(),
  });

  assert.equal(result.status, "bandwidth-limited");
  assert.equal(result.energyDetected, true);
  assert.equal(result.identified, true);
  assert.equal(result.demodCapable, false);
});

test("strong unsupported waveform reports mode mismatch", () => {
  const result = sensorEvaluation.evaluateSensorEmission({
    sensor: baseSensor({ modes: "AM", supportedWaveformFamilies: ["am-voice"], supportedModulations: ["am"] }),
    emitter: baseEmitter({ waveform: "DMR Tier II", modulation: "4FSK" }),
    sensorPosition: placedSensor,
    emitterPosition: placedEmitter,
    propagation: propagation({ forwardSimulation: { rssiDbm: -45, distanceKm: 1, pathLossDb: 80 } }),
  });

  assert.equal(result.status, "mode-mismatch");
  assert.equal(result.energyDetected, true);
  assert.equal(result.identified, false);
});

test("compatible mode with enough bandwidth and margin returns demod capable", () => {
  const result = sensorEvaluation.evaluateSensorEmission({
    sensor: baseSensor({ instantaneousBandwidthMHz: 1, modes: "NFM, FM" }),
    emitter: baseEmitter({ bandwidthKHz: 25, waveform: "FM voice", modulation: "FM" }),
    sensorPosition: placedSensor,
    emitterPosition: placedEmitter,
    propagation: propagation(),
  });

  assert.equal(result.status, "demod-capable");
  assert.equal(result.demodCapable, true);
  assert.equal(result.marginDb, 30);
});

test("terrain worker RSSI below sensitivity returns terrain masked details", () => {
  const result = sensorEvaluation.evaluateSensorEmission({
    sensor: baseSensor(),
    emitter: baseEmitter(),
    sensorPosition: placedSensor,
    emitterPosition: placedEmitter,
    propagation: propagation({
      terrainSourceLabel: "GeoTIFF",
      forwardSimulation: { rssiDbm: -121, distanceKm: 3, pathLossDb: 150 },
      forwardProfile: {
        distanceKm: 3,
        geometricLosClear: false,
        fresnelClear: false,
        passesPolicy: false,
        buildingBlocked: true,
        minClearanceM: -12,
      },
    }),
  });

  assert.equal(result.status, "terrain-masked");
  assert.equal(result.energyDetected, false);
  assert.equal(result.terrainSourceLabel, "GeoTIFF");
});

test("missing placement returns needs placement and does not count as detected", () => {
  const result = sensorEvaluation.evaluateSensorEmission({
    sensor: baseSensor(),
    emitter: baseEmitter(),
    sensorPosition: null,
    emitterPosition: placedEmitter,
    propagation: propagation(),
  });

  assert.equal(result.status, "not-placed");
  assert.equal(result.label, "Needs placement");
  assert.equal(result.sensed, false);
});

test("duplicate emissions dedupe and best emission selection prefers demod capable", () => {
  const emissions = sensorEvaluation.dedupeEmitterEmissions([
    { id: "primary", frequencyMHz: 150, bandwidthKHz: 25, waveform: "FM voice", modulation: "FM" },
    { id: "net-a", frequencyMHz: 150.0004, bandwidthKHz: 25, waveform: "FM voice", modulation: "FM" },
    { id: "net-b", frequencyMHz: 151, bandwidthKHz: 25, waveform: "FM voice", modulation: "FM" },
  ]);
  assert.equal(emissions.length, 2);

  const best = sensorEvaluation.pickBestSensorEmissionEvaluation([
    sensorEvaluation.evaluateSensorEmission({
      sensor: baseSensor({ frequencyMaxMHz: 150.5 }),
      emitter: baseEmitter({ frequencyMHz: 151 }),
      sensorPosition: placedSensor,
      emitterPosition: placedEmitter,
      propagation: propagation(),
    }),
    sensorEvaluation.evaluateSensorEmission({
      sensor: baseSensor({ instantaneousBandwidthMHz: 1 }),
      emitter: baseEmitter({ frequencyMHz: 150 }),
      sensorPosition: placedSensor,
      emitterPosition: placedEmitter,
      propagation: propagation(),
    }),
  ]);

  assert.equal(best.status, "demod-capable");
  assert.equal(best.emission.frequencyMHz, 150);
});
