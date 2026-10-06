import { describe, it, expect } from "vitest";
import { isPriced } from "./isPriced";

describe("isPriced", () => {
  it("takes any positive figure as a price", () => {
    expect(isPriced(4.1)).toBe(true);
  });

  it("reads 0, which a market with no orders reports, as no price", () => {
    expect(isPriced(0)).toBe(false);
  });

  it("reads a missing or unreadable figure as no price", () => {
    for (const value of [undefined, null, Number.NaN, Infinity, -1]) {
      expect(isPriced(value)).toBe(false);
    }
  });
});
