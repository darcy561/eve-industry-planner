import { describe, expect, it, vi } from "vitest";

vi.mock("../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", isLoggedIn: false },
      jobData: { jobArray: [], actions: {} },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  },
}));

const { default: ReprocessingItem } = await import("./reprocessingItem.js");
const { default: ReprocessingStructure } =
  await import("./reprocessingStructure.js");
const { reprocessingItemTypes } = await import("../Context/defaultValues");

// Veldspar: 100 units reprocess into 400 Tritanium.
function veldspar() {
  return new ReprocessingItem({
    id: 1230,
    name: "Veldspar",
    materials: { 34: 400 },
    batchSize: 100,
    itemType: reprocessingItemTypes.ore,
    reprocessingSkill: 12196,
  });
}

const NO_SKILLS = {};
const ALL_SKILLS = { 3385: 5, 3389: 5, 12196: 5 };

describe("how much of an ore can be reprocessed", () => {
  // Reprocessing runs in whole batches; the rest stays in the hangar.
  it("rounds down to whole batches and keeps the remainder", () => {
    const ore = veldspar();

    ore.setTotalQuantity(250);

    expect(ore.reprocessableQuantity).toBe(200);
    expect(ore.remainingQuantity).toBe(50);
  });

  it("recounts as more is added", () => {
    const ore = veldspar();

    ore.addToTotalQuantity(50);
    expect(ore.reprocessableQuantity).toBe(0);
    expect(ore.remainingQuantity).toBe(50);

    ore.addToTotalQuantity(50);
    expect(ore.reprocessableQuantity).toBe(100);
    expect(ore.remainingQuantity).toBe(0);
  });

  it("reprocesses nothing below one batch", () => {
    const ore = veldspar();

    ore.setTotalQuantity(99);

    expect(ore.reprocessableQuantity).toBe(0);
  });
});

describe("what an ore reprocesses into", () => {
  it("yields half the materials with no skills and an NPC station", () => {
    const ore = veldspar();
    ore.setTotalQuantity(100);

    ore.reprocessMaterials(NO_SKILLS, new ReprocessingStructure());

    expect(ore.percentageYield).toBe(50);
    expect(ore.reprocessedMaterials[34]).toBe(200);
  });

  // 50 × 1.15 × 1.10 × 1.10 = 69.575%
  it("yields more with the three reprocessing skills trained", () => {
    const ore = veldspar();
    ore.setTotalQuantity(100);

    ore.reprocessMaterials(ALL_SKILLS, new ReprocessingStructure());

    expect(ore.percentageYield).toBeCloseTo(69.575, 3);
    expect(ore.reprocessedMaterials[34]).toBe(278);
  });

  it("takes the structure's ore bonus", () => {
    const ore = veldspar();
    ore.setTotalQuantity(100);
    // Large Refinery: a 5.5% bonus to ore.
    const structure = new ReprocessingStructure({ structureType: 3 });

    ore.reprocessMaterials(NO_SKILLS, structure);

    expect(ore.percentageYield).toBeCloseTo(50 * 1.055, 6);
  });

  // Reprocessing does not change what the ore is, only what comes out of it.
  it("leaves the ore's own materials alone", () => {
    const ore = veldspar();
    ore.setTotalQuantity(100);

    ore.reprocessMaterials(ALL_SKILLS, new ReprocessingStructure());

    expect(ore.materials).toEqual({ 34: 400 });
  });
});

describe("a reprocessing structure's bonuses", () => {
  it("gives an ore bonus to ore, moon ore and ice, and none to gas", () => {
    const structure = new ReprocessingStructure({ structureType: 3 });

    for (const itemType of [
      reprocessingItemTypes.ore,
      reprocessingItemTypes.moonOre,
      reprocessingItemTypes.ice,
    ]) {
      expect(structure.structureBonusFor(itemType)).toBe(0.055);
    }
    expect(structure.structureBonusFor(reprocessingItemTypes.gas)).toBe(10);
  });

  it("gives no bonus at an NPC station", () => {
    const structure = new ReprocessingStructure();

    expect(structure.structureBonusFor(reprocessingItemTypes.ore)).toBe(0);
  });

  // Two rigs can be fitted; the better of the ones that apply is the one used.
  it("takes the strongest rig that applies to the item", () => {
    const oreOnly = new ReprocessingStructure({ rigSlot1: 1, rigSlot2: 0 });

    expect(oreOnly.rigBonusFor(reprocessingItemTypes.ore)).toBe(1);
    // A rig for ore does nothing for gas.
    expect(oreOnly.rigBonusFor(reprocessingItemTypes.gas)).toBe(0);
  });

  it("keeps its settings through a document round trip", () => {
    const structure = new ReprocessingStructure({
      id: "reprocessing-1",
      name: "Home refinery",
      structureType: 3,
      systemType: 2,
      rigSlot1: 1,
      rigSlot2: 2,
      implant: 1,
      tax: 2.5,
      default: true,
    });

    const document = structure.toDocument();

    expect(new ReprocessingStructure(document).toDocument()).toEqual(document);
    expect(document.tax).toBe(2.5);
    expect(document.default).toBe(true);
  });

  it("reads a tax that is not a number as none", () => {
    expect(new ReprocessingStructure({ tax: "abc" }).tax).toBe(0);
    expect(new ReprocessingStructure({}).tax).toBe(0);
  });
});
