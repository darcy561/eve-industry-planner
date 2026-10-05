import { describe, it, expect } from "vitest";
import {
  averageCostPerItem,
  compareToHistory,
  costRange,
} from "./buildComparison";

const history = (overrides = {}) => ({
  buildCount: 4,
  cheapestCostPerItem: 228,
  dearestCostPerItem: 236,
  lastCostPerItem: 230,
  lastCostMonth: { year: 2026, month: 5 },
  ...overrides,
});

describe("costRange", () => {
  it("describes the spread across builds", () => {
    expect(costRange(history())).toEqual({ low: 228, high: 236, spread: 8 });
  });

  // One build is a figure, not a range, and the strip already shows it as "last".
  it("returns null for a single build", () => {
    expect(
      costRange(history({ buildCount: 1, dearestCostPerItem: 228 })),
    ).toBeNull();
  });

  it("returns null when the marks carry no cost", () => {
    expect(costRange(history({ dearestCostPerItem: 0 }))).toBeNull();
    expect(costRange(undefined)).toBeNull();
  });
});

describe("averageCostPerItem", () => {
  it("takes the mean of the two marks", () => {
    expect(averageCostPerItem(history())).toBe(232);
  });

  it("is zero rather than NaN without marks", () => {
    expect(averageCostPerItem(undefined)).toBe(0);
  });
});

describe("compareToHistory", () => {
  it("places the build within the range and against the last one", () => {
    const got = compareToHistory(history(), 234);

    expect(got.builds).toBe(4);
    expect(got.last).toEqual({
      perUnit: 230,
      month: { year: 2026, month: 5 },
    });
    expect(got.delta.amount).toBe(4);
    expect(got.delta.share).toBeCloseTo(4 / 230);
    expect(got.bar).toEqual({ low: 228, high: 236, value: 234, average: 232 });
    expect(got.outside).toBeNull();
  });

  it("marks a build cheaper than every previous one", () => {
    const got = compareToHistory(history(), 200);

    expect(got.outside).toBe("below");
    expect(got.delta.amount).toBe(-30);
  });

  it("marks a build dearer than every previous one", () => {
    expect(compareToHistory(history(), 300).outside).toBe("above");
  });

  // A first build has a last cost but no spread, so the panel states the one
  // comparison it can make and draws no bar.
  it("compares against a single previous build without drawing a range", () => {
    const got = compareToHistory(
      history({
        buildCount: 1,
        cheapestCostPerItem: 230,
        dearestCostPerItem: 230,
      }),
      240,
    );

    expect(got.bar).toBeNull();
    expect(got.outside).toBeNull();
    expect(got.delta.amount).toBe(10);
  });

  it("has nothing to compare without archived builds", () => {
    const got = compareToHistory(undefined, 234);

    expect(got.builds).toBe(0);
    expect(got.last).toBeNull();
    expect(got.average).toBeNull();
    expect(got.delta).toBeNull();
    expect(got.bar).toBeNull();
  });

  // The cost the panel leads on can be absent — a job that makes nothing has no
  // per-unit figure — and that is not a reason to lose the history figures.
  it("keeps the history figures when this build's cost is unknown", () => {
    const got = compareToHistory(history(), null);

    expect(got.last.perUnit).toBe(230);
    expect(got.average).toBe(232);
    expect(got.delta).toBeNull();
    expect(got.bar).toBeNull();
  });

  // A build recorded as costing nothing is a gap in the archive, not a free
  // build, so it stands in for no last build at all rather than becoming the
  // figure everything is measured against.
  it("treats a zero last cost as no last build", () => {
    const got = compareToHistory(history({ lastCostPerItem: 0 }), 234);

    expect(got.last).toBeNull();
    expect(got.delta).toBeNull();
  });
});
