import { describe, expect, it } from "vitest";
import { VELDSPAR } from "../tests/reprocessingFixtures.js";

const { default: ReprocessingItem } = await import("./reprocessingItem.js");
const { structureFromDocument } =
  await import("../Functions/Custom Structures/customStructure.js");
const { reprocessingSetupFrom } =
  await import("../Functions/Reprocessing/engine/reprocessingSetup.js");
const { jobTypes } = await import("../Context/defaultValues");

function veldspar() {
  return new ReprocessingItem(VELDSPAR);
}

const NO_SKILLS = {};
const ALL_SKILLS = { 3385: 5, 3389: 5, 60377: 5 };

describe("how much of an ore can be reprocessed", () => {
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
      reprocessingSetupFrom(
        structureFromDocument(undefined, jobTypes.reprocessing),
        NO_SKILLS,
      ),
    );

    expect(ore.percentageYield).toBe(50);
    expect(ore.reprocessedMaterials[34]).toBe(200);
  });

  it("yields more with the three reprocessing skills trained", () => {
    const ore = veldspar();
    ore.setTotalQuantity(100);

    ore.reprocessMaterials(
      reprocessingSetupFrom(
        structureFromDocument(undefined, jobTypes.reprocessing),
        ALL_SKILLS,
      ),
    );

    expect(ore.percentageYield).toBeCloseTo(69.575, 3);
    expect(ore.reprocessedMaterials[34]).toBe(278);
  });

  it("takes the structure's ore bonus", () => {
    const ore = veldspar();
    ore.setTotalQuantity(100);
    const structure = structureFromDocument({
      jobType: jobTypes.reprocessing,
      structureType: 3,
    });

    ore.reprocessMaterials(reprocessingSetupFrom(structure, NO_SKILLS));

    expect(ore.percentageYield).toBeCloseTo(50 * 1.055, 6);
  });

  it("leaves the ore's own materials alone", () => {
    const ore = veldspar();
    ore.setTotalQuantity(100);

    ore.reprocessMaterials(
      reprocessingSetupFrom(
        structureFromDocument(undefined, jobTypes.reprocessing),
        ALL_SKILLS,
      ),
    );

    expect(ore.materials).toEqual({ 34: 400 });
  });
});
