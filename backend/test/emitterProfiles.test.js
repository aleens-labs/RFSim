const test = require("node:test");
const assert = require("node:assert/strict");

const {
  emitterProfileCreateSchema,
  emitterProfileOrderSchema,
  formatEmitterProfileRow,
  summarizeEmitterProfilePayload,
} = require("../src/emitterProfiles");
const { buildStarterEmitterProfiles } = require("../src/defaultEmitterProfiles");

test("emitterProfileCreateSchema accepts a full normalized emitter profile", () => {
  const parsed = emitterProfileCreateSchema.safeParse({
    name: "PRC-163 Assault Net",
    profile: {
      emitterType: "prc-163",
      programKey: "vhf-sincgars",
      type: "radio",
      emitterLabel: "AN/PRC-163 Falcon IV",
      force: "friendly",
      name: "Assault 1",
      unit: "A Co",
      icon: "radio",
      color: "#38bdf8",
      notes: "Primary command net",
      rf: {
        frequencyMHz: 46,
        bandwidthKHz: 25,
        modulation: "FHSS",
        waveform: "SINCGARS",
        duplex: "half-duplex",
        channelSpacingKHz: 25,
      },
      tx: {
        powerW: 5,
        dutyCycle: 0.5,
      },
      rx: {
        sensitivityDbm: -107,
      },
      antenna: {
        gainDbi: 2.15,
        heightM: 2,
        systemLossDb: 3,
      },
      prop: {
        model: "itu-p526",
        clutter: "open",
      },
      network: {
        isManet: false,
        relayCapable: false,
      },
      locationDefaults: {
        gridLocation: "",
        colocateAssetId: "",
      },
    },
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.profile.rf.waveform, "SINCGARS");
});

test("emitterProfileOrderSchema rejects empty ids", () => {
  const parsed = emitterProfileOrderSchema.safeParse({
    profileIds: ["ok", ""],
  });

  assert.equal(parsed.success, false);
});

test("summarizeEmitterProfilePayload derives list metadata from payload", () => {
  const summary = summarizeEmitterProfilePayload({
    type: "relay",
    emitterLabel: "Silvus StreamCaster 4200",
    force: "friendly",
    icon: "relay",
    color: "#22c55e",
    rf: {
      frequencyMHz: 2400,
      waveform: "SRW",
    },
    tx: {
      powerW: 2,
    },
  });

  assert.deepEqual(summary, {
    assetType: "relay",
    emitterLabel: "Silvus StreamCaster 4200",
    force: "friendly",
    icon: "relay",
    frequencyMHz: 2400,
    powerW: 2,
    waveform: "SRW",
    color: "#22c55e",
  });
});

test("formatEmitterProfileRow normalizes stored records for the client", () => {
  const formatted = formatEmitterProfileRow({
    id: "prof-1",
    name: "Mesh Relay",
    version: 3,
    asset_type: "relay",
    emitter_label: "Silvus StreamCaster 4200",
    force: "friendly",
    icon: "relay",
    color: "#22c55e",
    frequency_mhz: 2400,
    power_w: 2,
    waveform: "SRW",
    updated_at: "2026-05-05T20:00:00.000Z",
    created_at: "2026-05-05T19:00:00.000Z",
    profile_json: {
      type: "relay",
      emitterLabel: "Silvus StreamCaster 4200",
      force: "friendly",
      icon: "relay",
      color: "#22c55e",
      rf: {
        frequencyMHz: 2400,
        waveform: "SRW",
      },
      tx: {
        powerW: 2,
      },
    },
  });

  assert.equal(formatted.id, "prof-1");
  assert.equal(formatted.version, 3);
  assert.equal(formatted.profile.rf.frequencyMHz, 2400);
  assert.equal(formatted.waveform, "SRW");
});

test("starter emitter profile library defaults to empty", () => {
  const starterProfiles = buildStarterEmitterProfiles();

  assert.deepEqual(starterProfiles, []);
});
