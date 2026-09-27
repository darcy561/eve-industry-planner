import { describe, expect, it } from "vitest";

import coerceTaxPercentage from "./coerceTaxPercentage";

describe("reading a tax percentage", () => {
  it("keeps a percentage as it was entered", () => {
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

  it("reads a negative figure as no tax rather than as a discount", () => {
    expect(coerceTaxPercentage(-1)).toBe(0);
    expect(coerceTaxPercentage("-2.5")).toBe(0);
  });
});
