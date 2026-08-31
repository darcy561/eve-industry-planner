import { describe, it, expect } from "vitest";
import {
  estimateComparison,
  costRange,
  outputDestinations,
} from "./buildHistoryFigures";

describe("estimateComparison", () => {
  it("reports how far an estimate sits above the last build", () => {
    const got = estimateComparison(258, { lastCostPerItem: 240 });

    expect(got).toMatchObject({ estimate: 258, last: 240, difference: 18, dearer: true });
    expect(got.percent).toBeCloseTo(7.5);
  });

  it("reports a cheaper estimate as not dearer", () => {
    expect(estimateComparison(200, { lastCostPerItem: 250 })).toMatchObject({
      difference: -50,
      dearer: false,
    });
  });

  // Nothing to compare against is a different answer from "no change".
  it.each([
    ["no estimate", 0, { lastCostPerItem: 240 }],
    ["no build behind it", 258, { lastCostPerItem: 0 }],
    ["no history at all", 258, undefined],
  ])("returns null with %s", (_name, estimate, history) => {
    expect(estimateComparison(estimate, history)).toBeNull();
  });
});

describe("costRange", () => {
  it("describes the spread across builds", () => {
    expect(costRange({ buildCount: 4, cheapestCostPerItem: 228, dearestCostPerItem: 236 })).toEqual({
      low: 228,
      high: 236,
      spread: 8,
    });
  });

  // One build is a figure, not a range, and the strip already shows it as "last".
  it("returns null for a single build", () => {
    expect(costRange({ buildCount: 1, cheapestCostPerItem: 228, dearestCostPerItem: 228 })).toBeNull();
  });
});

describe("outputDestinations", () => {
  it("splits output by where it went", () => {
    const got = outputDestinations({
      breakdown: {
        standaloneRecordedSale: { itemBuildCount: 44 },
        retainedStock: { itemBuildCount: 5 },
        productionChain: { itemBuildCount: 3 },
      },
    });

    expect(got.total).toBe(52);
    expect(got.rows.map((r) => [r.key, r.quantity])).toEqual([
      ["market", 44],
      ["stock", 5],
      ["chain", 3],
    ]);
    expect(got.rows[0].share).toBeCloseTo(44 / 52);
  });

  it("returns nothing to draw when no output is recorded", () => {
    expect(outputDestinations({ breakdown: {} })).toEqual({ rows: [], total: 0 });
  });
});

