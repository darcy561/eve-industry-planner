import { beforeAll, describe, expect, it, vi } from "vitest";

import { rigBonusFor, structureBonusFor } from "./reprocessingBonuses";
import { reprocessingSetupFrom, yieldFor } from "./reprocessingSetup";
import { reprocess } from "./reprocess";
import { primeReprocessing } from "../../Static/reprocessing";
import {
  jobTypes,
  reprocessingItemTypes,
} from "../../../Context/defaultValues";

vi.mock("../../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: async () => ({
      items: LIVE_CORPUS_ITEMS,
      materialVolumes: {},
    }),
  });
});

const liveReprocessingSystem = {
  0: { id: 0, value: 0 },
  1: { id: 1, value: 0.06 },
  2: { id: 2, value: 0.12 },
};

const liveReprocessingStructure = {
  0: { id: 0, ore: 0, gas: 0 },
  1: { id: 1, ore: 0.02, gas: 4 },
  2: { id: 2, ore: 0, gas: 0 },
  3: { id: 3, ore: 0.055, gas: 10 },
  4: { id: 4, ore: 0, gas: 0 },
  5: { id: 5, ore: 0, gas: 0 },
};

const liveReprocessingRigs = {
  0: { id: 0, value: 0, appliesTo: [] },
  1: { id: 1, value: 1, appliesTo: [0, 5] },
  2: { id: 2, value: 1, appliesTo: [1] },
  3: { id: 3, value: 1, appliesTo: [2] },
  4: { id: 4, value: 3, appliesTo: [0, 5] },
  5: { id: 5, value: 3, appliesTo: [1] },
  6: { id: 6, value: 3, appliesTo: [2] },
  7: { id: 7, value: 1, appliesTo: [0, 5, 1, 2] },
  8: { id: 8, value: 3, appliesTo: [0, 5, 1, 2] },
};

function liveRigValue(structure, itemType) {
  let best = 0;
  for (const slot of [structure.rigSlot1, structure.rigSlot2]) {
    const rig = liveReprocessingRigs[slot];
    if (rig?.appliesTo?.includes(itemType)) best = Math.max(rig.value, best);
  }
  return best;
}

function liveStructureValue(structure, itemType) {
  const held = liveReprocessingStructure[structure.structureType];
  if (!held) return 0;

  if (
    itemType === reprocessingItemTypes.ore ||
    itemType === reprocessingItemTypes.moonOre ||
    itemType === reprocessingItemTypes.ice
  ) {
    return held.ore ?? 0;
  }
  if (itemType === reprocessingItemTypes.gas) return held.gas ?? 0;
  return 0;
}

function liveYield(structure, itemType, skills) {
  const rigMod = liveRigValue(structure, itemType);
  const sysMod = liveReprocessingSystem[structure.systemType]?.value ?? 0;
  const strucMod = liveStructureValue(structure, itemType);

  switch (itemType) {
    case reprocessingItemTypes.ore:
    case reprocessingItemTypes.unrefinedMineral:
    case reprocessingItemTypes.moonOre:
    case reprocessingItemTypes.ice: {
      const multipliers = [
        rigMod > 0 ? 1 + sysMod : 1,
        1 + strucMod,
        1 + skills.repro * 0.03,
        1 + skills.eff * 0.02,
        1 + skills.ore * 0.02,
        1 + skills.implant,
      ];
      return (50 + rigMod) * multipliers.reduce((all, mod) => all * mod, 1);
    }
    case reprocessingItemTypes.scrap:
      return 50 * (1 + skills.ore * 0.02);
    case reprocessingItemTypes.gas:
      return 80 + strucMod + skills.ore;
    default:
      return 0;
  }
}

const LIVE_KINDS = Object.values(reprocessingItemTypes).filter(
  (kind) => kind !== reprocessingItemTypes.erratic,
);
const ITEM_SKILL = 60377;
const IMPLANT_ID_BY_VALUE = { 0: 0, 0.04: 3 };

function newYield(structure, itemType, skills) {
  const setup = reprocessingSetupFrom(
    { ...structure, implant: IMPLANT_ID_BY_VALUE[skills.implant] },
    { 3385: skills.repro, 3389: skills.eff, [ITEM_SKILL]: skills.ore },
  );
  return yieldFor(setup, { itemType, reprocessingSkill: ITEM_SKILL });
}

function everyLiveStructure() {
  const structures = [];
  for (const structureType of Object.keys(liveReprocessingStructure).map(
    Number,
  )) {
    for (const systemType of [0, 1, 2]) {
      for (const rigSlot1 of Object.keys(liveReprocessingRigs).map(Number)) {
        for (const rigSlot2 of [0, 3, 8]) {
          structures.push({
            jobType: jobTypes.reprocessing,
            structureType,
            systemType,
            rigSlot1,
            rigSlot2,
          });
        }
      }
    }
  }
  return structures;
}

const SKILL_SETS = [
  { repro: 0, eff: 0, ore: 0, implant: 0 },
  { repro: 5, eff: 5, ore: 5, implant: 0.04 },
  { repro: 3, eff: 4, ore: 2, implant: 0 },
];

describe("what a refinery yields, against the live model", () => {
  it("covers every saved structure shape live can hold", () => {
    expect(everyLiveStructure()).toHaveLength(6 * 3 * 9 * 3);
  });

  it("yields exactly what live yields, for every item type", () => {
    const differences = [];

    for (const structure of everyLiveStructure()) {
      for (const itemType of LIVE_KINDS) {
        for (const skills of SKILL_SETS) {
          const live = liveYield(structure, itemType, skills);
          const now = newYield(structure, itemType, skills);
          if (Math.abs(live - now) < 1e-9) continue;
          differences.push({ ...structure, itemType, live, now });
        }
      }
    }

    expect(differences).toEqual([]);
  });

  it("reads a rig's bonus the same way live read it", () => {
    for (const structure of everyLiveStructure()) {
      for (const itemType of LIVE_KINDS) {
        expect({
          ...structure,
          itemType,
          value: rigBonusFor(structure, itemType),
        }).toEqual({
          ...structure,
          itemType,
          value: liveRigValue(structure, itemType),
        });
      }
    }
  });

  it("reads a structure's bonus the same way live read it", () => {
    for (const structure of everyLiveStructure()) {
      for (const itemType of LIVE_KINDS) {
        expect(structureBonusFor(structure, itemType)).toBe(
          liveStructureValue(structure, itemType),
        );
      }
    }
  });
});

function corpusItem(id, name, batchSize, itemType, materials) {
  return { id, name, batchSize, itemType, materials, reprocessingSkill: 60377 };
}

const { ore, moonOre, ice, gas } = reprocessingItemTypes;
const LIVE_CORPUS_ITEMS = {
  1230: corpusItem("1230", "Veldspar", 100, ore, { 34: 400 }),
  28432: corpusItem("28432", "Batch Compressed Veldspar", 1, ore, { 34: 400 }),
  1228: corpusItem("1228", "Scordite", 100, ore, { 34: 150, 35: 110 }),
  22: corpusItem("22", "Arkonor", 100, ore, { 35: 3200, 36: 1200, 40: 120 }),
  11396: corpusItem("11396", "Mercoxit", 100, ore, { 11399: 140 }),
  17470: corpusItem("17470", "Veldspar II-Grade", 100, ore, { 34: 420 }),
  45490: corpusItem("45490", "Zeolites", 100, moonOre, {
    35: 8000,
    36: 400,
    16634: 65,
  }),
  16262: corpusItem("16262", "Clear Icicle", 1, ice, {
    16272: 69,
    16273: 35,
    16274: 414,
    16275: 1,
  }),
  62396: corpusItem("62396", "Compressed Amber Cytoserocin", 1, gas, {
    25268: 1,
  }),
  62402: corpusItem("62402", "Compressed Fullerite-C28", 1, gas, { 30375: 1 }),
};

const QUANTITIES = [0, 1, 99, 100, 101, 250, 642, 1283, 128450, 3999999];

function liveRunGives(entry, quantity, percentageYield) {
  const reprocessableQuantity =
    Math.floor(quantity / entry.batchSize) * entry.batchSize;
  const totals = {};
  for (const [id, value] of Object.entries(entry.materials)) {
    const reprocessed = Math.round(
      entry.itemType === reprocessingItemTypes.gas
        ? reprocessableQuantity * (percentageYield / 100)
        : value * (percentageYield / 100),
    );
    totals[id] =
      entry.itemType === reprocessingItemTypes.gas
        ? reprocessed
        : reprocessed * (reprocessableQuantity / entry.batchSize);
  }
  return totals;
}

describe("what a run gives, against the live model", () => {
  beforeAll(() => primeReprocessing());

  it("gives exactly what live gives, for every item, quantity, structure and skill set", () => {
    const differences = [];

    for (const structure of everyLiveStructure()) {
      for (const skills of SKILL_SETS) {
        const setup = reprocessingSetupFrom(
          { ...structure, implant: IMPLANT_ID_BY_VALUE[skills.implant] },
          { 3385: skills.repro, 3389: skills.eff, [ITEM_SKILL]: skills.ore },
        );
        for (const entry of Object.values(LIVE_CORPUS_ITEMS)) {
          const percentageYield = liveYield(structure, entry.itemType, skills);
          for (const quantity of QUANTITIES) {
            const live = liveRunGives(entry, quantity, percentageYield);
            const [now] = reprocess(
              [{ typeID: entry.id, quantity }],
              setup,
            ).items;
            if (JSON.stringify(now.outputs) === JSON.stringify(live)) continue;
            differences.push({
              ...structure,
              name: entry.name,
              quantity,
              live,
              now: now.outputs,
            });
          }
        }
      }
    }

    expect(differences.slice(0, 5)).toEqual([]);
  });
});
