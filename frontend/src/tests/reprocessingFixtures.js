import { reprocessingItemTypes } from "../Context/defaultValues";

/** Reprocessing file entries as SDE build 3326071 gives them, one of each kind the engine handles. */
export const VELDSPAR = {
  id: "1230",
  name: "Veldspar",
  materials: { 34: 400 },
  batchSize: 100,
  itemType: reprocessingItemTypes.ore,
  reprocessingSkill: 60377,
  volume: 0.1,
};
export const SCORDITE = {
  id: "1228",
  name: "Scordite",
  materials: { 34: 150, 35: 110 },
  batchSize: 100,
  itemType: reprocessingItemTypes.ore,
  reprocessingSkill: 60377,
  volume: 0.15,
};
export const HEDBERGITE = {
  id: "21",
  name: "Hedbergite",
  materials: { 35: 450, 38: 120 },
  batchSize: 100,
  itemType: reprocessingItemTypes.ore,
  reprocessingSkill: 60378,
  volume: 3,
};
export const MERCOXIT = {
  id: "11396",
  name: "Mercoxit",
  materials: { 11399: 140 },
  batchSize: 100,
  itemType: reprocessingItemTypes.ore,
  reprocessingSkill: 12189,
  volume: 40,
};
export const BATCH_COMPRESSED_VELDSPAR = {
  id: "28430",
  name: "Batch Compressed Veldspar II-Grade",
  materials: { 34: 420 },
  batchSize: 1,
  itemType: reprocessingItemTypes.ore,
  reprocessingSkill: 60377,
  volume: 0.15,
};
export const BITUMENS = {
  id: "45492",
  name: "Bitumens",
  materials: { 35: 6000, 36: 400, 16633: 65 },
  batchSize: 100,
  itemType: reprocessingItemTypes.moonOre,
  reprocessingSkill: 46152,
  volume: 10,
};
export const CLEAR_ICICLE = {
  id: "16262",
  name: "Clear Icicle",
  materials: { 16272: 69, 16273: 35, 16274: 414, 16275: 1 },
  batchSize: 1,
  itemType: reprocessingItemTypes.ice,
  reprocessingSkill: 18025,
  volume: 1000,
};
export const COMPRESSED_AMBER_CYTOSEROCIN = {
  id: "62396",
  name: "Compressed Amber Cytoserocin",
  materials: { 25268: 1 },
  batchSize: 1,
  itemType: reprocessingItemTypes.gas,
  reprocessingSkill: 62452,
  volume: 1,
};
export const PRISMATICITE = {
  id: "90041",
  name: "Prismaticite",
  materials: {},
  randomizedMaterials: {
    34: { quantityMin: 368000, quantityMax: 496800 },
    35: { quantityMin: 89464, quantityMax: 111830 },
    36: { quantityMin: 35420, quantityMax: 45540 },
    37: { quantityMin: 23920, quantityMax: 31280 },
    38: { quantityMin: 2875, quantityMax: 4025 },
    39: { quantityMin: 1299, quantityMax: 1528 },
    40: { quantityMin: 634, quantityMax: 830 },
    11399: { quantityMin: 312, quantityMax: 624 },
  },
  batchSize: 100,
  itemType: reprocessingItemTypes.erratic,
  reprocessingSkill: 90040,
  volume: 40,
};
export const UNREFINED_MORPHITE = {
  id: "90298",
  name: "Unrefined Morphite",
  materials: {},
  randomizedMaterials: { 11399: { quantityMin: 93, quantityMax: 187 } },
  batchSize: 100,
  itemType: reprocessingItemTypes.unrefinedMineral,
  reprocessingSkill: 90398,
  volume: 40,
};

/** The volume of one unit of each material the fixture entries give, as the file states it. */
export const MATERIAL_VOLUMES = {
  34: 0.01,
  35: 0.01,
  36: 0.01,
  37: 0.01,
  38: 0.01,
  39: 0.01,
  40: 0.01,
  11399: 0.01,
  16272: 0.4,
  16273: 0.4,
  16274: 0.03,
  16275: 3,
};

export const EVERY_ENTRY = [
  VELDSPAR,
  SCORDITE,
  HEDBERGITE,
  MERCOXIT,
  BATCH_COMPRESSED_VELDSPAR,
  BITUMENS,
  CLEAR_ICICLE,
  COMPRESSED_AMBER_CYTOSEROCIN,
  PRISMATICITE,
  UNREFINED_MORPHITE,
];

/**
 * A reprocessing static file holding the given entries, every fixture entry by default.
 *
 * @param {Array<Object>} [entries]
 * @param {Object<string, number>} [materialVolumes]
 * @returns {{items: Object<string, Object>, materialVolumes: Object<string, number>}}
 */
export function reprocessingFile(
  entries = EVERY_ENTRY,
  materialVolumes = MATERIAL_VOLUMES,
) {
  return {
    items: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
    materialVolumes,
  };
}
