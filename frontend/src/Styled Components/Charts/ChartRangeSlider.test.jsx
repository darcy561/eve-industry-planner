import { describe, it, expect } from "vitest";
import { trailingRange } from "./ChartRangeSlider";

describe("trailingRange", () => {
  // The default window is the most recent rows, since that is what a reader
  // wants first.
  it("covers the trailing window", () => {
    expect(trailingRange(100, 30)).toEqual([70, 99]);
  });

  // A series shorter than the window shows all of it rather than a negative
  // start index.
  it("clamps to the available rows", () => {
    expect(trailingRange(5, 30)).toEqual([0, 4]);
  });

  // No rows must not produce [-1, ...], which would index outside the data.
  it("handles an empty series", () => {
    expect(trailingRange(0, 30)).toEqual([0, 0]);
  });

  it("handles a single row", () => {
    expect(trailingRange(1, 30)).toEqual([0, 0]);
  });
});
