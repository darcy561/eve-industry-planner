import { describe, expect, it } from "vitest";

import manufacturingFormulaCalculation from "./manufacturingMaterialCalculation";

/**
 * Every material quantity the planner shows comes through here, so these pin the
 * game's rules rather than the implementation: what each modifier does, that a
 * base quantity of one is exempt, and where the rounding falls.
 */
const noModifiers = [0, 0, 0];

describe("manufacturing material quantities", () => {
  it("needs base × runs × slots when nothing modifies it", () => {
    expect(manufacturingFormulaCalculation(100, 10, 2, ...noModifiers)).toBe(
      2000,
    );
  });

  it("reduces the requirement by blueprint material efficiency", () => {
    // 100 × 0.9 = 90 per run
    expect(manufacturingFormulaCalculation(100, 1, 1, 10, 0, 0)).toBe(90);
  });

  it("reduces it by the structure as well", () => {
    // 100 × 0.9 (ME) × 0.99 (structure) = 89.1, rounded up
    expect(manufacturingFormulaCalculation(100, 1, 1, 10, 1, 0)).toBe(90);
  });

  it("reduces it by the rig figure it is given", () => {
    expect(manufacturingFormulaCalculation(100, 1, 1, 0, 0, 2.2)).toBe(98);
    expect(manufacturingFormulaCalculation(1000, 1, 1, 0, 0, 2.2)).toBe(978);
  });

  it("compounds the modifiers rather than adding them", () => {
    expect(manufacturingFormulaCalculation(1_000_000, 1, 1, 10, 1, 2.2)).toBe(
      871_398,
    );
  });

  it("never reduces a material the recipe needs exactly one of", () => {
    // The exemption is what keeps a single-unit component from rounding to
    // nothing, and it holds however good the efficiency is.
    expect(manufacturingFormulaCalculation(1, 1, 1, 10, 1, 2.2)).toBe(1);
    expect(manufacturingFormulaCalculation(1, 5, 3, 10, 1, 2.2)).toBe(15);
  });

  it("rounds each slot up on its own before counting the slots", () => {
    // Two slots of 4.5 are two jobs of 5, not one job of 9: rounding after
    // multiplying would understate the requirement by one per slot.
    expect(manufacturingFormulaCalculation(9, 1, 2, 50, 0, 0)).toBe(10);
  });

  it("rounds a part unit up rather than down", () => {
    // 10 × 0.99 = 9.9
    expect(manufacturingFormulaCalculation(10, 1, 1, 1, 0, 0)).toBe(10);
  });

  it("never asks for less than one unit", () => {
    expect(manufacturingFormulaCalculation(2, 0, 1, 0, 0, 0)).toBe(1);
    expect(manufacturingFormulaCalculation(2, 1, 0, 0, 0, 0)).toBe(1);
  });
});
