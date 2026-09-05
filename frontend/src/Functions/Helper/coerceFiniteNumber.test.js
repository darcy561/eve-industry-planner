import { describe, expect, it } from "vitest";

import coerceFiniteNumber from "./coerceFiniteNumber";

describe("reading a number from a structure setting", () => {
  it("takes a number as it is", () => {
    expect(coerceFiniteNumber(2.5)).toBe(2.5);
    expect(coerceFiniteNumber(0)).toBe(0);
    expect(coerceFiniteNumber(-1)).toBe(-1);
  });

  // Settings come from text fields, so the value is often the typed string.
  it("reads a typed number, spaces and all", () => {
    expect(coerceFiniteNumber("2.5")).toBe(2.5);
    expect(coerceFiniteNumber("  30000142 ")).toBe(30000142);
  });

  it("falls back for anything that is not a number", () => {
    expect(coerceFiniteNumber("abc")).toBe(0);
    expect(coerceFiniteNumber(null)).toBe(0);
    expect(coerceFiniteNumber(undefined)).toBe(0);
    expect(coerceFiniteNumber("")).toBe(0);
    expect(coerceFiniteNumber(Infinity)).toBe(0);
    expect(coerceFiniteNumber(NaN)).toBe(0);
  });

  it("uses the fallback it was given", () => {
    expect(coerceFiniteNumber(undefined, 30000142)).toBe(30000142);
    expect(coerceFiniteNumber("abc", 30000142)).toBe(30000142);
  });
});
