import { describe, expect, it } from "vitest";

import reactionFormulaCalculation from "./reactionMaterialCalculation";

/**
 * A reaction has no blueprint and no structure material term — only the rig,
 * whose figure arrives already scaled to the band it runs in. These pin that
 * narrower rule, and the rounding and single-unit exemption it shares with
 * manufacturing.
 */
describe("reaction material quantities", () => {
  it("needs base × runs × slots when nothing modifies it", () => {
    expect(reactionFormulaCalculation(100, 10, 2, 0)).toBe(2000);
  });

  it("reduces the requirement by the rig figure it is given", () => {
    expect(reactionFormulaCalculation(100, 1, 1, 2.2)).toBe(98);
    expect(reactionFormulaCalculation(1000, 1, 1, 2.2)).toBe(978);
  });

  it("removes nothing when the rig gives nothing in this band", () => {
    expect(reactionFormulaCalculation(100, 1, 1, 0)).toBe(100);
  });

  it("never reduces a material the recipe needs exactly one of", () => {
    expect(reactionFormulaCalculation(1, 1, 1, 2.2)).toBe(1);
    expect(reactionFormulaCalculation(1, 5, 3, 2.2)).toBe(15);
  });

  it("rounds each slot up on its own before counting the slots", () => {
    expect(reactionFormulaCalculation(9, 1, 2, 50)).toBe(10);
  });

  it("never asks for less than one unit", () => {
    expect(reactionFormulaCalculation(2, 0, 1, 0)).toBe(1);
    expect(reactionFormulaCalculation(2, 1, 0, 0)).toBe(1);
  });
});
