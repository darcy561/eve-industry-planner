import { describe, expect, it } from "vitest";

import { reprocessFromItemType } from "./reprocessingFormulas";
import {
  rigBonusFor,
  rigSecurityFor,
  structureBonusFor,
} from "./reprocessingBonuses";
import { jobTypes, reprocessingItemTypes } from "../../Context/defaultValues";

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
    case reprocessingItemTypes.unrefinedOre:
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

function newYield(structure, itemType, skills) {
  return reprocessFromItemType(
    itemType,
    rigBonusFor(structure, itemType),
    rigSecurityFor(structure, itemType),
    structureBonusFor(structure, itemType),
    skills.repro,
    skills.eff,
    skills.ore,
    skills.implant,
  );
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
      for (const itemType of Object.values(reprocessingItemTypes)) {
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
      for (const itemType of Object.values(reprocessingItemTypes)) {
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
      for (const itemType of Object.values(reprocessingItemTypes)) {
        expect(structureBonusFor(structure, itemType)).toBe(
          liveStructureValue(structure, itemType),
        );
      }
    }
  });
});
