import { reprocessingItemTypes } from "../Context/defaultValues";
import { MATERIAL_VOLUMES } from "./reprocessingFixtures.js";

/**
 * One ore as the reprocessing file holds it, in batches of 100.
 *
 * @returns {Object}
 */
function oreEntry(id, name, materials, reprocessingSkill, volume) {
  return {
    id,
    name,
    materials,
    batchSize: 100,
    itemType: reprocessingItemTypes.ore,
    reprocessingSkill,
    volume,
  };
}

/** Every standard ore and its compressed form as SDE build 3326071 gives them. */
export const BENCHMARK_ORES = [
  oreEntry("22", "Arkonor", { 35: 3200, 36: 1200, 40: 120 }, 60380, 16.0),
  oreEntry("1223", "Bistot", { 35: 3200, 36: 1200, 39: 160 }, 60380, 16.0),
  oreEntry(
    "62568",
    "Compressed Arkonor",
    { 35: 3200, 36: 1200, 40: 120 },
    60380,
    0.16,
  ),
  oreEntry(
    "62564",
    "Compressed Bistot",
    { 35: 3200, 36: 1200, 39: 160 },
    60380,
    0.16,
  ),
  oreEntry(
    "62560",
    "Compressed Crokite",
    { 35: 800, 36: 2000, 38: 800 },
    60379,
    0.16,
  ),
  oreEntry(
    "62556",
    "Compressed Dark Ochre",
    { 36: 1360, 37: 1200, 38: 320 },
    60379,
    0.08,
  ),
  oreEntry(
    "62552",
    "Compressed Gneiss",
    { 35: 2000, 36: 1500, 37: 800 },
    60379,
    0.05,
  ),
  oreEntry("62548", "Compressed Hedbergite", { 35: 450, 38: 120 }, 60378, 0.03),
  oreEntry("62544", "Compressed Hemorphite", { 37: 240, 38: 90 }, 60378, 0.03),
  oreEntry("62540", "Compressed Jaspet", { 36: 150, 38: 50 }, 60378, 0.02),
  oreEntry("62536", "Compressed Kernite", { 36: 60, 37: 120 }, 60378, 0.012),
  oreEntry("62586", "Compressed Mercoxit", { 11399: 140 }, 12189, 0.4),
  oreEntry("62532", "Compressed Omber", { 35: 90, 37: 75 }, 60378, 0.006),
  oreEntry(
    "62528",
    "Compressed Plagioclase",
    { 34: 175, 36: 70 },
    60377,
    0.0035,
  ),
  oreEntry("62524", "Compressed Pyroxeres", { 35: 90, 36: 30 }, 60377, 0.003),
  oreEntry("62520", "Compressed Scordite", { 34: 150, 35: 110 }, 60377, 0.0015),
  oreEntry(
    "62572",
    "Compressed Spodumain",
    { 34: 48000, 37: 1000, 38: 160, 39: 80, 40: 40 },
    60380,
    0.16,
  ),
  oreEntry("62516", "Compressed Veldspar", { 34: 400 }, 60377, 0.001),
  oreEntry("1225", "Crokite", { 35: 800, 36: 2000, 38: 800 }, 60379, 16.0),
  oreEntry("1232", "Dark Ochre", { 36: 1360, 37: 1200, 38: 320 }, 60379, 8.0),
  oreEntry("1229", "Gneiss", { 35: 2000, 36: 1500, 37: 800 }, 60379, 5.0),
  oreEntry("21", "Hedbergite", { 35: 450, 38: 120 }, 60378, 3.0),
  oreEntry("1231", "Hemorphite", { 37: 240, 38: 90 }, 60378, 3.0),
  oreEntry("1226", "Jaspet", { 36: 150, 38: 50 }, 60378, 2.0),
  oreEntry("20", "Kernite", { 36: 60, 37: 120 }, 60378, 1.2),
  oreEntry("11396", "Mercoxit", { 11399: 140 }, 12189, 40.0),
  oreEntry("1227", "Omber", { 35: 90, 37: 75 }, 60378, 0.6),
  oreEntry("18", "Plagioclase", { 34: 175, 36: 70 }, 60377, 0.35),
  oreEntry("1224", "Pyroxeres", { 35: 90, 36: 30 }, 60377, 0.3),
  oreEntry("1228", "Scordite", { 34: 150, 35: 110 }, 60377, 0.15),
  oreEntry(
    "19",
    "Spodumain",
    { 34: 48000, 37: 1000, 38: 160, 39: 80, 40: 40 },
    60380,
    16.0,
  ),
  oreEntry("1230", "Veldspar", { 34: 400 }, 60377, 0.1),
];

/** Mineral prices the benchmark is priced against, invented as the worked example's are. */
export const BENCHMARK_MINERAL_PRICES = {
  34: 4.1,
  35: 12.4,
  36: 48,
  37: 118,
  38: 815,
  39: 1090,
  40: 2780,
  11399: 9800,
};

/** What each ore sells for against its minerals' value at 90.63%, raw; compressed ore costs 2% more. */
export const BENCHMARK_ORE_RATIOS = {
  Arkonor: 0.86,
  Bistot: 0.9,
  Crokite: 0.88,
  "Dark Ochre": 0.87,
  Gneiss: 0.85,
  Hedbergite: 0.91,
  Hemorphite: 0.89,
  Jaspet: 0.84,
  Kernite: 0.86,
  Mercoxit: 0.93,
  Omber: 0.9,
  Plagioclase: 0.83,
  Pyroxeres: 0.92,
  Scordite: 0.84,
  Spodumain: 0.95,
  Veldspar: 0.88,
};

/**
 * A price for every ore and mineral in the benchmark: an ore at its minerals' value at 90.63% times its
 * ratio, compressed ore 2% dearer, rounded to the cent.
 *
 * @returns {Object<string, number>}
 */
export function benchmarkPrices() {
  const prices = { ...BENCHMARK_MINERAL_PRICES };
  for (const ore of BENCHMARK_ORES) {
    const raw = ore.name.replace(/^Compressed /, "");
    const batchValue = Object.entries(ore.materials).reduce(
      (total, [typeID, quantity]) =>
        total +
        Math.floor(quantity * 0.9063) * BENCHMARK_MINERAL_PRICES[typeID],
      0,
    );
    const compressed = raw === ore.name ? 1 : 1.02;
    prices[ore.id] =
      Math.round(
        (batchValue / 100) * BENCHMARK_ORE_RATIOS[raw] * compressed * 100,
      ) / 100;
  }
  return prices;
}

/** The benchmark's ores as a reprocessing file. */
export function benchmarkFile() {
  return {
    items: Object.fromEntries(BENCHMARK_ORES.map((ore) => [ore.id, ore])),
    materialVolumes: MATERIAL_VOLUMES,
  };
}

/** The three need lists the benchmark measures, as units keyed by mineral type id. */
export const BENCHMARK_NEEDS = {
  workedExample: { 34: 2000000, 35: 450000, 36: 120000, 38: 4000 },
  capitalMix: {
    34: 20000000,
    35: 5000000,
    36: 1500000,
    37: 300000,
    38: 60000,
    39: 20000,
    40: 8000,
  },
  highEndHeavy: { 36: 200000, 37: 150000, 38: 40000, 39: 15000, 40: 6000 },
};
