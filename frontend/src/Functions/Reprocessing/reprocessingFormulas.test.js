import { describe, expect, it } from "vitest";

import { reprocessFromItemType } from "./reprocessingFormulas";
import { reprocessingItemTypes } from "../../Context/defaultValues";

// The arguments in the order the formula takes them.
function yieldFor(itemType, { rig = 0, sys = 0, struct = 0, repro = 0, eff = 0, ore = 0, implant = 0 } = {}) {
  return reprocessFromItemType(itemType, rig, sys, struct, repro, eff, ore, implant);
}

describe("what reprocessing an ore yields", () => {
  it("starts at half the ore with no skills and no structure", () => {
    expect(yieldFor(reprocessingItemTypes.ore)).toBe(50);
  });

  // 50 × 1.15 × 1.10 × 1.10 — Reprocessing V, Efficiency V, ore skill V.
  it("compounds the three skills", () => {
    expect(yieldFor(reprocessingItemTypes.ore, { repro: 5, eff: 5, ore: 5 })).toBeCloseTo(
      50 * 1.15 * 1.1 * 1.1,
      10,
    );
  });

  it("adds a rig to the base rather than multiplying it", () => {
    expect(yieldFor(reprocessingItemTypes.ore, { rig: 2 })).toBe(52);
  });

  // A system's security bonus only applies in a structure that has a rig.
  it("counts the system only alongside a rig", () => {
    expect(yieldFor(reprocessingItemTypes.ore, { sys: 0.1 })).toBe(50);
    expect(yieldFor(reprocessingItemTypes.ore, { rig: 2, sys: 0.1 })).toBeCloseTo(52 * 1.1, 10);
  });

  it("multiplies the structure and the implant", () => {
    expect(yieldFor(reprocessingItemTypes.ore, { struct: 0.02, implant: 0.04 })).toBeCloseTo(
      50 * 1.02 * 1.04,
      10,
    );
  });

  // Moon ore and ice reprocess by the same rules as ore.
  it("treats moon ore and ice like ore", () => {
    const modifiers = { repro: 5, eff: 4 };
    const oreYield = yieldFor(reprocessingItemTypes.ore, modifiers);

    expect(yieldFor(reprocessingItemTypes.moonOre, modifiers)).toBe(oreYield);
    expect(yieldFor(reprocessingItemTypes.ice, modifiers)).toBe(oreYield);
    expect(yieldFor(reprocessingItemTypes.unrefinedOre, modifiers)).toBe(oreYield);
  });
});

describe("what reprocessing scrap yields", () => {
  // Scrap answers to its own skill and nothing else.
  it("rises with the scrap skill alone", () => {
    expect(yieldFor(reprocessingItemTypes.scrap)).toBe(50);
    expect(yieldFor(reprocessingItemTypes.scrap, { ore: 5 })).toBeCloseTo(55, 10);
    expect(
      yieldFor(reprocessingItemTypes.scrap, { ore: 5, rig: 2, struct: 0.02, repro: 5 }),
    ).toBeCloseTo(55, 10);
  });
});
