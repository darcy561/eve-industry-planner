import { describe, it, expect } from "vitest";
import {
  costRange,
  historyWindow,
  monthLabel,
  outputDestinations,
  shortMonthLabel,
} from "./buildHistoryFigures";

describe("costRange", () => {
  it("describes the spread across builds", () => {
    expect(
      costRange({
        buildCount: 4,
        cheapestCostPerItem: 228,
        dearestCostPerItem: 236,
      }),
    ).toEqual({
      low: 228,
      high: 236,
      spread: 8,
    });
  });

  // One build is a figure, not a range, and the strip already shows it as "last".
  it("returns null for a single build", () => {
    expect(
      costRange({
        buildCount: 1,
        cheapestCostPerItem: 228,
        dearestCostPerItem: 228,
      }),
    ).toBeNull();
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
    expect(outputDestinations({ breakdown: {} })).toEqual({
      rows: [],
      total: 0,
    });
  });
});

describe("month labels", () => {
  it("renders a calendar month for a figure, and a key for an axis", () => {
    expect(monthLabel({ year: 2026, month: 3 })).toBe("Mar 2026");
    expect(shortMonthLabel("2026-03")).toBe("Mar 26");
  });

  it.each([
    ["unset", undefined],
    ["zeroed", { year: 0, month: 0 }],
    ["out of range", { year: 2026, month: 13 }],
  ])("returns null when the month is %s", (_name, month) => {
    expect(monthLabel(month)).toBeNull();
  });

  // An axis tick has to render something, so an unreadable key passes through
  // rather than leaving a blank label.
  it("passes an unreadable key through to the axis", () => {
    expect(shortMonthLabel("not-a-month")).toBe("not-a-month");
  });
});

// The window comes from cost months, not archive dates: a job's costs are filed
// under the month production started, which on imported history can be years
// before the job was archived.
describe("historyWindow", () => {
  it("spans the months the item's costs are filed under", () => {
    expect(
      historyWindow({
        firstCostMonth: { year: 2024, month: 9 },
        lastCostMonth: { year: 2026, month: 5 },
      }),
    ).toEqual({ from: "2024-09", to: "2026-05" });
  });

  it("returns null without marks to derive it from", () => {
    expect(historyWindow(undefined)).toBeNull();
    expect(
      historyWindow({ firstCostMonth: { year: 2024, month: 9 } }),
    ).toBeNull();
  });
});
