import { describe, expect, it } from "vitest";

import coerceTaxPercentage from "./coerceTaxPercentage";

describe("reading a tax percentage", () => {
  it("keeps a percentage as it was entered", () => {
    // 2.5 means 2.5%, not 250%: the figure is not rescaled on the way in.
    expect(coerceTaxPercentage(2.5)).toBe(2.5);
    expect(coerceTaxPercentage(0)).toBe(0);
    expect(coerceTaxPercentage(100)).toBe(100);
  });

  it("reads the text a user typed", () => {
    expect(coerceTaxPercentage("2.5")).toBe(2.5);
    expect(coerceTaxPercentage(" 2.5 ")).toBe(2.5);
  });

  it("reads anything that is not a number as no tax", () => {
    for (const value of ["", "abc", null, undefined, {}, NaN, Infinity]) {
      expect(coerceTaxPercentage(value)).toBe(0);
    }
  });

  // A structure charges or it does not; a negative figure would pay a job to
  // run, which no screen offers and no consumer expects.
  it("reads a negative figure as no tax rather than as a discount", () => {
    expect(coerceTaxPercentage(-1)).toBe(0);
    expect(coerceTaxPercentage("-2.5")).toBe(0);
  });
});
