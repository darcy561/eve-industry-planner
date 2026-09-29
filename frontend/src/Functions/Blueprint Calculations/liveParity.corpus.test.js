import { describe, expect, it, vi } from "vitest";

import materialQuantitiesForSetup from "./calculateMaterialsForSetup";
import Setup from "../../Classes/jobSetup";
import { jobTypes } from "../../Context/defaultValues";
import { readIndustryBonusCatalogue } from "../Static/industryBonuses";
import { itemRecord } from "../Static/items";

vi.mock("../Static/industryBonuses", () => ({
  readIndustryBonusCatalogue: vi.fn(() => ({ families: {}, sources: {} })),
}));
vi.mock("../Static/items", async (importOriginal) => ({
  ...(await importOriginal()),
  itemRecord: vi.fn(() => undefined),
}));

const liveManRigs = {
  0: { id: 0, material: 0, time: 0 },
  1: { id: 1, material: 2.0, time: 0 },
  2: { id: 2, material: 2.4, time: 0 },
  3: { id: 3, material: 0, time: 0.2 },
  4: { id: 4, material: 0, time: 0.24 },
  5: { id: 5, material: 2.0, time: 0.2 },
  6: { id: 6, material: 2.4, time: 0.24 },
  7: { id: 7, material: 2.0, time: 0.24 },
  8: { id: 8, material: 2.4, time: 0.2 },
  9: { id: 9, material: 3.7, time: 0.2, requirementID: 1 },
};

const liveManStructure = {
  0: { id: 0, material: 0, requirementID: 2 },
  1: { id: 1, material: 1 },
  2: { id: 2, material: 1 },
  3: { id: 3, material: 1 },
  4: { id: 4, material: 1.06, requirementID: 0 },
};

const liveManSystem = {
  0: { id: 0, value: 1 },
  1: { id: 1, value: 1.9 },
  2: { id: 2, value: 2.1 },
  3: { id: 3, value: 1, requirementID: 0 },
};

const liveRequirements = {
  0: { id: 0, rigID: 0, systemTypeID: 3, structureID: 4, systemID: 30100000 },
  1: { id: 1, rigID: 9, alternativeSystemValue: { 0: 0.1, 1: 1.9, 2: 0.1 } },
  2: { id: 2, rigID: 0, structureID: 0 },
};

const foldedRigSlots = {
  0: [0, 0],
  1: [1, 0],
  2: [2, 0],
  3: [3, 0],
  4: [4, 0],
  5: [1, 3],
  6: [2, 4],
  7: [1, 4],
  8: [2, 3],
  9: [9, 0],
};

function liveRequirementsFor(setup) {
  const gathered = {};
  for (const table of [
    liveManStructure[setup.structureID],
    liveManRigs[setup.rigID],
    liveManSystem[setup.systemTypeID],
  ]) {
    const id = table?.requirementID;
    if (id == null) continue;
    Object.assign(gathered, liveRequirements[id]);
  }
  return gathered;
}

function liveMaterialQuantity(setup, rawQuantity) {
  const gathered = liveRequirementsFor(setup);

  const structure = Object.hasOwn(gathered, "structureID")
    ? liveManStructure[gathered.structureID]
    : liveManStructure[setup.structureID];
  const rig = Object.hasOwn(gathered, "rigID")
    ? liveManRigs[gathered.rigID]
    : liveManRigs[setup.rigID];
  const band = liveManSystem[setup.systemTypeID];

  const systemValue = Object.hasOwn(gathered, "alternativeSystemValue")
    ? (gathered.alternativeSystemValue[band?.id] ?? band?.value ?? 0)
    : (band?.value ?? 0);

  const modifier =
    (1 - setup.ME / 100) *
    (1 - (structure?.material ?? 0) / 100) *
    (1 - ((rig?.material ?? 0) / 100) * systemValue);

  const perRun = rawQuantity === 1 ? rawQuantity : rawQuantity * modifier;
  return Math.max(Math.ceil(setup.runCount * perRun) * setup.jobCount, 1);
}

function newMaterialQuantity(liveSetup, rawQuantity, itemID) {
  const [rigSlot1, rigSlot2] = foldedRigSlots[liveSetup.rigID];
  const setup = new Setup({
    jobType: jobTypes.manufacturing,
    runCount: liveSetup.runCount,
    jobCount: liveSetup.jobCount,
    ME: liveSetup.ME,
    structureID: liveSetup.structureID,
    rigSlot1,
    rigSlot2,
    systemTypeID: liveSetup.systemTypeID,
  });

  const counts = materialQuantitiesForSetup(
    setup,
    [{ typeID: 34, quantity: rawQuantity }],
    itemID,
  );
  return counts[34].quantity;
}

function everyLiveSetup() {
  const corpus = [];
  for (const rigID of Object.keys(liveManRigs).map(Number)) {
    for (const structureID of Object.keys(liveManStructure).map(Number)) {
      for (const systemTypeID of Object.keys(liveManSystem).map(Number)) {
        for (const ME of [0, 4, 10]) {
          for (const [runCount, jobCount] of [
            [1, 1],
            [7, 3],
          ]) {
            corpus.push({
              rigID,
              structureID,
              systemTypeID,
              ME,
              runCount,
              jobCount,
            });
          }
        }
      }
    }
  }
  return corpus;
}

const RAW_QUANTITIES = [1, 9, 1000, 1_000_000];

function differences() {
  const found = [];
  for (const liveSetup of everyLiveSetup()) {
    for (const rawQuantity of RAW_QUANTITIES) {
      const live = liveMaterialQuantity(liveSetup, rawQuantity);
      const now = newMaterialQuantity(liveSetup, rawQuantity);
      if (live === now) continue;
      found.push({ ...liveSetup, rawQuantity, live, now });
    }
  }
  return found;
}

/**
 * Where a difference between the two models comes from, or nothing when this
 * project never meant to change that setup.
 */
function intendedCause(entry) {
  const atTheFulcrum = entry.structureID === 4 || entry.systemTypeID === 3;
  if (atTheFulcrum && entry.now >= entry.live) {
    return "the Fulcrum's corrected material bonus";
  }

  if (entry.rigID === 9 && entry.structureID === 0 && entry.now > entry.live) {
    return "a rig fitted at an NPC station, which takes none";
  }
  return null;
}

describe("what a manufacturing setup asks for, against the live model", () => {
  it("covers every rig, structure and band live can hold", () => {
    expect(everyLiveSetup()).toHaveLength(10 * 5 * 4 * 3 * 2);
  });

  it("differs from live only where this project meant it to", () => {
    const unexplained = differences().filter((entry) => !intendedCause(entry));

    expect(unexplained).toEqual([]);
  });

  it("only ever asks for more where a bonus was withdrawn", () => {
    for (const entry of differences()) {
      expect({ ...entry, more: entry.now >= entry.live }).toMatchObject({
        more: true,
      });
    }
  });

  it("asks for exactly what live asks, everywhere else", () => {
    const unchanged = everyLiveSetup()
      .filter((setup) => setup.structureID !== 4 && setup.systemTypeID !== 3)
      .filter((setup) => !(setup.rigID === 9 && setup.structureID === 0));

    for (const setup of unchanged) {
      for (const rawQuantity of RAW_QUANTITIES) {
        expect({
          ...setup,
          rawQuantity,
          q: newMaterialQuantity(setup, rawQuantity),
        }).toEqual({
          ...setup,
          rawQuantity,
          q: liveMaterialQuantity(setup, rawQuantity),
        });
      }
    }
  });

  it("keeps the faction rig's own multipliers, which live already applied", () => {
    const factionRig = differences().filter(
      (entry) =>
        entry.rigID === 9 &&
        entry.structureID !== 0 &&
        entry.structureID !== 4 &&
        entry.systemTypeID !== 3,
    );

    expect(factionRig).toEqual([]);
  });

  it("refuses a rig at an NPC station, where live applied one", () => {
    const atAnNPCStation = differences().filter(
      (entry) =>
        entry.rigID === 9 &&
        entry.structureID === 0 &&
        entry.systemTypeID !== 3,
    );

    expect(atAnNPCStation.length).toBeGreaterThan(0);
    for (const entry of atAnNPCStation) {
      expect(entry.now).toBeGreaterThan(entry.live);
    }
  });

  it("gives The Fulcrum's bonus only to an item it helps", () => {
    readIndustryBonusCatalogue.mockReturnValue({
      families: { 11: { id: 11, groupIDs: [485] } },
      sources: {},
    });
    itemRecord.mockReturnValue({
      group_id: 26,
      category_id: 6,
      faction_id: 500011,
    });

    const atTheFulcrum = {
      rigID: 0,
      structureID: 4,
      systemTypeID: 0,
      ME: 0,
      runCount: 1,
      jobCount: 1,
    };

    const angelCruiser = 17720;

    expect(newMaterialQuantity(atTheFulcrum, 1_000_000, angelCruiser)).toBe(
      940_000,
    );
    expect(newMaterialQuantity(atTheFulcrum, 1_000_000)).toBe(1_000_000);

    vi.restoreAllMocks();
  });
});
