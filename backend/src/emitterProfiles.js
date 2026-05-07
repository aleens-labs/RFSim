const { z } = require("zod");

const EMITTER_FORCE_VALUES = ["friendly", "enemy", "host-nation", "civilian", "unknown", "other"];
const EMITTER_ICON_VALUES = ["radio", "jammer", "relay", "receiver", "tower", "sensor"];

const boundedNumber = (minimum, maximum) => z.number().finite().min(minimum).max(maximum);
const optionalNumber = (minimum, maximum) => boundedNumber(minimum, maximum).nullable().optional().default(null);

const emitterProfilePayloadSchema = z.object({
  radioType: z.string().max(120).optional().default(""),
  programKey: z.string().max(120).optional().default(""),
  type: z.enum(EMITTER_ICON_VALUES).optional().default("radio"),
  emitterLabel: z.string().max(160).optional().default("radio"),
  force: z.enum(EMITTER_FORCE_VALUES).optional().default("friendly"),
  name: z.string().max(160).optional().default(""),
  unit: z.string().max(160).optional().default(""),
  icon: z.enum(EMITTER_ICON_VALUES).optional().default("radio"),
  color: z.string().max(40).optional().default("#38bdf8"),
  notes: z.string().max(4000).optional().default(""),
  rf: z.object({
    frequencyMHz: boundedNumber(0.001, 100000).optional().default(150),
    bandwidthKHz: optionalNumber(0, 1000000),
    modulation: z.string().max(120).optional().default("FM"),
    waveform: z.string().max(160).optional().default("analog"),
    duplex: z.string().max(80).optional().default("simplex"),
    channelSpacingKHz: optionalNumber(0, 1000000),
  }).default({}),
  tx: z.object({
    powerW: boundedNumber(0, 1000000).optional().default(5),
    dutyCycle: optionalNumber(0, 1),
    papr: optionalNumber(0, 1000),
    spectralEfficiency: optionalNumber(0, 100000),
  }).default({}),
  rx: z.object({
    sensitivityDbm: boundedNumber(-200, 100).optional().default(-107),
    noiseFigDb: optionalNumber(0, 200),
    requiredSnrDb: optionalNumber(-50, 200),
    acrDb: optionalNumber(0, 300),
    bdrDb: optionalNumber(0, 300),
  }).default({}),
  antenna: z.object({
    type: z.string().max(120).optional().default("whip"),
    gainDbi: boundedNumber(-100, 200).optional().default(2.15),
    pattern: z.string().max(120).optional().default("omnidirectional"),
    polarization: z.string().max(120).optional().default("vertical"),
    heightM: boundedNumber(0, 100000).optional().default(2),
    cableLossDb: optionalNumber(0, 1000),
    systemLossDb: boundedNumber(0, 1000).optional().default(3),
  }).default({}),
  prop: z.object({
    model: z.string().max(120).optional().default("itu-p525"),
    clutter: z.string().max(120).optional().default("open"),
    terrainEnabled: z.boolean().optional().default(true),
    diffractionEnabled: z.boolean().optional().default(true),
    nvisEnabled: z.boolean().optional().default(false),
    ionoModel: z.string().max(120).optional().default("simple"),
    timeDayEffects: z.boolean().optional().default(false),
    solarIndex: optionalNumber(0, 1000),
  }).default({}),
  network: z.object({
    isManet: z.boolean().optional().default(false),
    relayCapable: z.boolean().optional().default(false),
    maxHops: optionalNumber(1, 1024),
    latencyMs: optionalNumber(0, 1000000),
    adaptiveDataRate: z.boolean().optional().default(false),
    satcomEnabled: z.boolean().optional().default(false),
    satType: z.string().max(80).optional().default(""),
    satUplinkMHz: optionalNumber(0, 1000000),
    satDownlinkMHz: optionalNumber(0, 1000000),
    satGainDbi: optionalNumber(-100, 200),
  }).default({}),
  locationDefaults: z.object({
    gridLocation: z.string().max(120).optional().default(""),
    colocateAssetId: z.string().max(200).optional().default(""),
  }).default({}),
});

const emitterProfileCreateSchema = z.object({
  name: z.string().min(1).max(120),
  profile: emitterProfilePayloadSchema,
});

const emitterProfileUpdateSchema = emitterProfileCreateSchema;

const emitterProfileOrderSchema = z.object({
  profileIds: z.array(z.string().min(1).max(200)).default([]),
});

function summarizeEmitterProfilePayload(payload) {
  return {
    assetType: payload.type || "radio",
    emitterLabel: payload.emitterLabel || "radio",
    force: payload.force || "friendly",
    icon: payload.icon || "radio",
    frequencyMHz: Number(payload.rf?.frequencyMHz ?? 0) || 0,
    powerW: Number(payload.tx?.powerW ?? 0) || 0,
    waveform: payload.rf?.waveform || "",
    color: payload.color || "#38bdf8",
  };
}

function formatEmitterProfileRow(row) {
  if (!row) {
    return null;
  }
  const profile = emitterProfilePayloadSchema.parse(row.profile_json ?? {});
  return {
    id: row.id,
    name: row.name,
    version: Number(row.version ?? 1) || 1,
    assetType: row.asset_type || profile.type || "radio",
    emitterLabel: row.emitter_label || profile.emitterLabel || "radio",
    force: row.force || profile.force || "friendly",
    icon: row.icon || profile.icon || "radio",
    color: row.color || profile.color || "#38bdf8",
    frequencyMHz: Number(row.frequency_mhz ?? profile.rf?.frequencyMHz ?? 0) || 0,
    powerW: Number(row.power_w ?? profile.tx?.powerW ?? 0) || 0,
    waveform: row.waveform || profile.rf?.waveform || "",
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    profile,
  };
}

module.exports = {
  EMITTER_FORCE_VALUES,
  EMITTER_ICON_VALUES,
  emitterProfilePayloadSchema,
  emitterProfileCreateSchema,
  emitterProfileUpdateSchema,
  emitterProfileOrderSchema,
  summarizeEmitterProfilePayload,
  formatEmitterProfileRow,
};
