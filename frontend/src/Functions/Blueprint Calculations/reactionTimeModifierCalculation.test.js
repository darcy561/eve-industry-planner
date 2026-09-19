import { describe, expect, it, vi } from "vitest";

const structureTime = { value: 0 };
const rigTime = { value: 0 };

vi.mock("../Helper/getStructureInfo", () => ({
  getStructureInfoFromID: () => ({ time: structureTime.value }),
  getRigInfoFromID: () => ({ time: rigTime.value }),
}));

const { default: reactionTimeModifierCalculation } =
  await import("./reactionTimeModifierCalculation.js");

const REACTIONS = 45746;

const skills = (level) =>
  level === undefined
    ? {}
    : { [REACTIONS]: { id: REACTIONS, activeLevel: level } };

function baseline({ structure = 0, rig = 0, level } = {}) {
  structureTime.value = structure;
  return reactionTimeModifierCalculation(0, rig, skills(level));
}

describe("reaction time modifier", () => {
  it("leaves the time alone when nothing reduces it", () => {
    expect(baseline()).toBe(1);
  });

  it("refuses to guess when an input is missing", () => {
    expect(reactionTimeModifierCalculation(null, 0, {})).toBe(0);
    expect(reactionTimeModifierCalculation(0, null, {})).toBe(0);
    expect(reactionTimeModifierCalculation(0, 0, null)).toBe(0);
  });

  it("takes 4% off per level of Reactions", () => {
    expect(baseline({ level: 3 })).toBeCloseTo(0.88);
  });

  it("stops at Reactions V, which is exactly where the floor sits", () => {
    expect(baseline({ level: 5 })).toBeCloseTo(0.8);
    expect(baseline({ level: 9 })).toBeCloseTo(0.8);
  });

  it("has no blueprint term, unlike manufacturing", () => {
    // A reaction has no researchable time efficiency, so the only reductions are
    // the skill, the structure and the rig.
    expect(baseline({ level: 5, structure: 0.2, rig: 0.1 })).toBeCloseTo(
      0.8 * 0.8 * 0.9,
    );
  });

  it("treats an untrained skill as level zero", () => {
    expect(baseline({ level: undefined })).toBe(1);
  });
});
