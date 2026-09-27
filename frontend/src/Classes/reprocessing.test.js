import { describe, expect, it, vi } from "vitest";

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock();
});

const { default: ReprocessingItem } = await import("./reprocessingItem.js");
const { structureFromDocument } =
  await import("../Functions/Structure/customStructure.js");
const { jobTypes, reprocessingItemTypes } =
  await import("../Context/defaultValues");

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

    ore.reprocessMaterials(
      NO_SKILLS,
      structureFromDocument(undefined, jobTypes.reprocessing),
    );

    expect(ore.percentageYield).toBe(50);
    expect(ore.reprocessedMaterials[34]).toBe(200);
  });

  // 50 × 1.15 × 1.10 × 1.10 = 69.575%
  it("yields more with the three reprocessing skills trained", () => {
    const ore = veldspar();
    ore.setTotalQuantity(100);

    ore.reprocessMaterials(
      ALL_SKILLS,
      structureFromDocument(undefined, jobTypes.reprocessing),
    );

    expect(ore.percentageYield).toBeCloseTo(69.575, 3);
    expect(ore.reprocessedMaterials[34]).toBe(278);
  });

  it("takes the structure's ore bonus", () => {
    const ore = veldspar();
    ore.setTotalQuantity(100);
    // Large Refinery: a 5.5% bonus to ore.
    const structure = structureFromDocument({
      jobType: jobTypes.reprocessing,
      structureType: 3,
    });

    ore.reprocessMaterials(NO_SKILLS, structure);

    expect(ore.percentageYield).toBeCloseTo(50 * 1.055, 6);
  });

  // Reprocessing does not change what the ore is, only what comes out of it.
  it("leaves the ore's own materials alone", () => {
    const ore = veldspar();
    ore.setTotalQuantity(100);

    ore.reprocessMaterials(
      ALL_SKILLS,
      structureFromDocument(undefined, jobTypes.reprocessing),
    );

    expect(ore.materials).toEqual({ 34: 400 });
  });
});
