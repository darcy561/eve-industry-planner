import { describe, expect, it, vi } from "vitest";

const structureTime = { value: 0 };
const rigTime = { value: 0 };

vi.mock("../Custom Structures/getStructureInfo", () => ({
  getStructureInfoFromID: () => ({ time: structureTime.value }),
  getRigInfoFromID: () => ({ time: rigTime.value }),
}));

const { default: manufacturingTimeModifierCalculation } =
  await import("./manufacturingTimeModifierCalculation.js");

const INDUSTRY = 3380;
const ADVANCED_INDUSTRY = 3388;

const skills = (levels = {}) =>
  Object.fromEntries(
    Object.entries(levels).map(([id, activeLevel]) => [
      id,
      { id: Number(id), activeLevel },
    ]),
  );

/** Nothing trained, no structure or rig bonus: the modifier should be 1. */
function baseline(overrides = {}) {
  structureTime.value = overrides.structure ?? 0;
  rigTime.value = overrides.rig ?? 0;
  return manufacturingTimeModifierCalculation(
    overrides.te ?? 0,
    overrides.structureID ?? 0,
    overrides.rig ?? 0,
    overrides.skills ?? skills(),
  );
}

describe("manufacturing time modifier", () => {
  it("leaves the time alone when nothing reduces it", () => {
    expect(baseline()).toBe(1);
  });

  it("refuses to guess when an input is missing", () => {
    expect(manufacturingTimeModifierCalculation(null, 0, 0, {})).toBe(0);
    expect(manufacturingTimeModifierCalculation(0, null, 0, {})).toBe(0);
    expect(manufacturingTimeModifierCalculation(0, 0, null, {})).toBe(0);
    expect(manufacturingTimeModifierCalculation(0, 0, 0, null)).toBe(0);
  });

  it("takes twice the blueprint's time efficiency value off", () => {
    // The stored value is half the in-game TE, so 5 is TE 10 and removes 10%.
    expect(baseline({ te: 5 })).toBeCloseTo(0.9);
  });

  it("takes 4% off per level of Industry", () => {
    expect(baseline({ skills: skills({ [INDUSTRY]: 3 }) })).toBeCloseTo(0.88);
  });

  it("takes 3% off per level of Advanced Industry", () => {
    expect(
      baseline({ skills: skills({ [ADVANCED_INDUSTRY]: 3 }) }),
    ).toBeCloseTo(0.91);
  });

  it("compounds the reductions rather than adding them", () => {
    // 0.9 (TE) × 0.8 (Industry V) × 0.85 (Adv Industry V)
    expect(
      baseline({
        te: 5,
        skills: skills({ [INDUSTRY]: 5, [ADVANCED_INDUSTRY]: 5 }),
      }),
    ).toBeCloseTo(0.612);
  });

  it("applies the structure's and the rig's own reductions", () => {
    expect(baseline({ structure: 0.15, rig: 0.2 })).toBeCloseTo(0.85 * 0.8);
  });

  describe("the floors each term stops at", () => {
    it("stops taking time off past the maximum blueprint efficiency", () => {
      // The stored value tops out at 10; anything beyond it changes nothing.
      expect(baseline({ te: 10 })).toBeCloseTo(0.8);
      expect(baseline({ te: 50 })).toBeCloseTo(0.8);
    });

    it("stops at Industry V, which is exactly where the floor sits", () => {
      expect(baseline({ skills: skills({ [INDUSTRY]: 5 }) })).toBeCloseTo(0.8);
      expect(baseline({ skills: skills({ [INDUSTRY]: 9 }) })).toBeCloseTo(0.8);
    });

    it("stops at Advanced Industry V, likewise", () => {
      expect(
        baseline({ skills: skills({ [ADVANCED_INDUSTRY]: 5 }) }),
      ).toBeCloseTo(0.85);
      expect(
        baseline({ skills: skills({ [ADVANCED_INDUSTRY]: 9 }) }),
      ).toBeCloseTo(0.85);
    });
  });

  it("treats an untrained skill as level zero", () => {
    expect(baseline({ skills: {} })).toBe(1);
  });
});
