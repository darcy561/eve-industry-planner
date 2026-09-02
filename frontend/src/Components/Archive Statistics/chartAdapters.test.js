import { describe, it, expect } from "vitest";
import {
  monthKey,
  toTimelineRows,
  toCumulativeRows,
  toItemRows,
  toSegmentRows,
  toExtrasRows,
  toExtrasTotalRows,
  toCostComponentRows,
  toCostComponentTotalRows,
  toBuildCostPerUnitRows,
  BUILD_COST_COMPONENTS,
  sumTimelineMeasures,
} from "./chartAdapters";

describe("monthKey", () => {
  // The wire format is zero-padded so lexical order matches calendar order.
  it("pads to YYYY-MM", () => {
    expect(monthKey({ year: 2026, month: 7 })).toBe("2026-07");
    expect(monthKey({ year: 2026, month: 12 })).toBe("2026-12");
  });
});

describe("toTimelineRows", () => {
  it("returns no rows for an absent response", () => {
    expect(toTimelineRows(undefined)).toEqual([]);
  });

  // The month in progress is a partial figure; a view that did not know would
  // draw it as a finished month that happened to be lower than the rest.
  it("carries whether each month is complete", () => {
    const rows = toTimelineRows({
      months: [
        { year: 2026, month: 7, complete: true, profitLoss: 10 },
        { year: 2026, month: 8, complete: false, profitLoss: 4 },
      ],
    });
    expect(rows[0].complete).toBe(true);
    expect(rows[1].complete).toBe(false);
  });

  // Absent fields are zero rather than undefined, which would break the axis.
  it("defaults missing measures to zero", () => {
    const [row] = toTimelineRows({ months: [{ year: 2026, month: 7 }] });
    expect(row.profitLoss).toBe(0);
    expect(row.jobCostTotal).toBe(0);
    expect(row.salesTotal).toBe(0);
  });
});

describe("toCumulativeRows", () => {
  it("accumulates profit across the window", () => {
    const rows = toCumulativeRows({
      months: [
        { year: 2026, month: 6, profitLoss: 100 },
        { year: 2026, month: 7, profitLoss: 50 },
        { year: 2026, month: 8, profitLoss: 25 },
      ],
    });
    expect(rows.map((r) => r.cumulativeProfit)).toEqual([100, 150, 175]);
  });

  // A losing month lowers the running total rather than resetting it.
  it("carries losses down", () => {
    const rows = toCumulativeRows({
      months: [
        { year: 2026, month: 6, profitLoss: 100 },
        { year: 2026, month: 7, profitLoss: -30 },
      ],
    });
    expect(rows[1].cumulativeProfit).toBe(70);
  });
});

describe("toItemRows", () => {
  // Ranking is the server's: it ordered every item in the window, and a page
  // re-sorted here would be ranked only against itself.
  it("keeps the server's order", () => {
    const rows = toItemRows({
      items: [
        { typeID: 1, profitLoss: 5 },
        { typeID: 2, profitLoss: 900 },
      ],
    });
    expect(rows.map((r) => r.typeID)).toEqual([1, 2]);
  });

  it("resolves names when known", () => {
    const rows = toItemRows({ items: [{ typeID: 587 }] }, { 587: "Rifter" });
    expect(rows[0].name).toBe("Rifter");
  });

  // A name that has not loaded yet must not render as "undefined". The map may
  // hold an explicit undefined for a type the cache did not know, so the
  // fallback tests the value rather than the key.
  it("falls back to the type id", () => {
    expect(toItemRows({ items: [{ typeID: 587 }] })[0].name).toBe("Type 587");
    expect(
      toItemRows({ items: [{ typeID: 587 }] }, { 587: undefined })[0].name,
    ).toBe("Type 587");
  });
});

describe("toSegmentRows", () => {
  function row(overrides) {
    return {
      breakdown: {
        productionChain: { jobCostTotal: 0 },
        retainedStock: { jobCostTotal: 0 },
        standaloneRecordedSale: { jobCostTotal: 0 },
        ...overrides,
      },
    };
  }

  it("returns nothing when the row carries no breakdown", () => {
    expect(toSegmentRows({})).toEqual([]);
    expect(toSegmentRows(undefined)).toEqual([]);
  });

  // Empty segments are dropped rather than drawn as zero-width slices.
  it("omits segments with no activity", () => {
    const rows = toSegmentRows(row({ retainedStock: { jobCostTotal: 400 } }));
    expect(rows).toEqual([{ segment: "Stock", value: 400 }]);
  });

  // The labels match the archive dialogue's blocks, so the two cannot disagree.
  it("labels segments as the dialogue does", () => {
    const rows = toSegmentRows(
      row({
        productionChain: { jobCostTotal: 1 },
        retainedStock: { jobCostTotal: 2 },
        standaloneRecordedSale: { jobCostTotal: 3 },
      }),
    );
    expect(rows.map((r) => r.segment).sort()).toEqual([
      "Chain",
      "Market",
      "Stock",
    ]);
  });

  it("compares whichever measure is asked for", () => {
    const rows = toSegmentRows(
      row({ retainedStock: { jobCostTotal: 10, salesTotal: 99 } }),
      "salesTotal",
    );
    expect(rows[0].value).toBe(99);
  });
});

describe("toExtrasRows", () => {
  const months = [
    { year: 2026, month: 7, extraCategoryTotals: { 1: 500, 3: 200 } },
    { year: 2026, month: 8, extraCategoryTotals: { 1: 100 } },
  ];

  it("builds a series per category seen in the window", () => {
    const { series } = toExtrasRows({ months }, [
      { id: "1", label: "Hauling Service" },
      { id: "3", label: "Blueprint Copies" },
    ]);
    expect(series.map((s) => s.label)).toEqual([
      "Hauling Service",
      "Blueprint Copies",
    ]);
  });

  // A past cost belongs to the category it was filed under, so a category the
  // user has since deleted must still resolve rather than showing a bare id.
  it("names deleted categories", () => {
    const { series } = toExtrasRows({ months: [months[0]] }, [
      { id: "1", label: "Hauling Service", deleted: true },
      { id: "3", label: "Blueprint Copies" },
    ]);
    expect(series.find((s) => s.key === "1").label).toBe("Hauling Service");
  });

  // A category missing from the list entirely still has to draw.
  it("falls back to the id when a category is unknown", () => {
    const { series } = toExtrasRows({ months: [months[0]] }, []);
    expect(series.find((s) => s.key === "1").label).toBe("Category 1");
  });

  // A month that used a category the others did not still contributes its bar.
  it("keeps a category used in only one month", () => {
    const { rows, series } = toExtrasRows({ months }, []);
    expect(series.map((s) => s.key)).toEqual(["1", "3"]);
    expect(rows[0]["3"]).toBe(200);
    expect(rows[1]["3"]).toBeUndefined();
  });

  // Zero-valued entries are not activity and would add an empty series.
  it("ignores zero totals", () => {
    const { series } = toExtrasRows(
      { months: [{ year: 2026, month: 7, extraCategoryTotals: { 9: 0 } }] },
      [],
    );
    expect(series).toEqual([]);
  });

  it("returns nothing for an absent response", () => {
    expect(toExtrasRows(undefined, [])).toEqual({ rows: [], series: [] });
  });
});

describe("toExtrasTotalRows", () => {
  const categories = [
    { id: "1", label: "Hauling Service" },
    { id: "90", label: "Retired Courier Contract", deleted: true },
  ];

  test("reads the window's own totals rather than re-summing months", () => {
    const rows = toExtrasTotalRows(
      { totals: { extraCategoryTotals: { 1: 300, 90: 700 } } },
      categories,
    );

    expect(rows).toEqual([
      { category: "Retired Courier Contract", value: 700 },
      { category: "Hauling Service", value: 300 },
    ]);
  });

  test("names a category the account no longer lists", () => {
    const rows = toExtrasTotalRows(
      { totals: { extraCategoryTotals: { 7: 10 } } },
      categories,
    );

    expect(rows).toEqual([{ category: "Category 7", value: 10 }]);
  });

  test("drops categories with nothing in them, which a slice cannot show", () => {
    const rows = toExtrasTotalRows(
      { totals: { extraCategoryTotals: { 1: 0, 90: -5 } } },
      categories,
    );

    expect(rows).toEqual([]);
  });

  test("survives a response with no totals", () => {
    expect(toExtrasTotalRows(undefined, categories)).toEqual([]);
    expect(toExtrasTotalRows({}, categories)).toEqual([]);
  });
});

describe("cost components", () => {
  const data = {
    months: [
      {
        year: 2026,
        month: 3,
        complete: true,
        materialCostTotal: 100,
        installCostTotal: 10,
        inventionCostTotal: 5,
        extrasTotal: 7,
        brokersFeeTotal: 2,
        transactionFeeTotal: 3,
      },
    ],
    totals: {
      materialCostTotal: 100,
      installCostTotal: 10,
      inventionCostTotal: 0,
      extrasTotal: 7,
      brokersFeeTotal: 2,
      transactionFeeTotal: 3,
    },
  };

  test("carries every component through per month", () => {
    expect(toCostComponentRows(data)).toEqual([
      {
        month: "2026-03",
        complete: true,
        materialCostTotal: 100,
        installCostTotal: 10,
        inventionCostTotal: 5,
        extrasTotal: 7,
        brokersFeeTotal: 2,
        transactionFeeTotal: 3,
      },
    ]);
  });

  test("a month missing a component reads as zero rather than a gap", () => {
    const rows = toCostComponentRows({ months: [{ year: 2026, month: 4 }] });

    expect(rows[0].materialCostTotal).toBe(0);
    expect(rows[0].transactionFeeTotal).toBe(0);
  });

  // The pie reads the response's own totals, so it cannot disagree with the
  // month-by-month chart beside it.
  test("slices the window's totals, largest first", () => {
    expect(toCostComponentTotalRows(data)).toEqual([
      { component: "Materials", value: 100 },
      { component: "Install", value: 10 },
      { component: "Extras", value: 7 },
      { component: "Transaction Fees", value: 3 },
      { component: "Broker fees", value: 2 },
    ]);
  });

  test("drops a component with nothing in it, which a slice cannot show", () => {
    const rows = toCostComponentTotalRows(data);

    expect(rows.map((row) => row.component)).not.toContain("Invention");
  });

  test("survives a response with no months or totals", () => {
    expect(toCostComponentRows(undefined)).toEqual([]);
    expect(toCostComponentTotalRows(undefined)).toEqual([]);
  });
});

describe("toBuildCostPerUnitRows", () => {
  it("divides each build component by what the month produced", () => {
    const rows = toBuildCostPerUnitRows({
      months: [
        {
          year: 2026,
          month: 3,
          quantityProduced: 4,
          quantitySold: 2,
          salesTotal: 600,
          materialCostTotal: 800,
          installCostTotal: 40,
          inventionCostTotal: 60,
          extrasTotal: 20,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      month: "2026-03",
      quantityProduced: 4,
      materialCostTotal: 200,
      installCostTotal: 10,
      inventionCostTotal: 15,
      extrasTotal: 5,
      averageSalePrice: 300,
    });
  });

  it("reports null for a month that produced nothing", () => {
    const [row] = toBuildCostPerUnitRows({
      months: [{ year: 2026, month: 4, quantityProduced: 0, materialCostTotal: 500 }],
    });

    expect(row.materialCostTotal).toBeNull();
    expect(row.averageSalePrice).toBeNull();
  });

  it("leaves sale-side fees out of the build components", () => {
    expect(BUILD_COST_COMPONENTS.map((c) => c.key)).toEqual([
      "materialCostTotal",
      "installCostTotal",
      "inventionCostTotal",
      "extrasTotal",
    ]);
  });
});

describe("summing a window", () => {
  const months = [
    { year: 2025, month: 12, quantityProduced: 1, profitLoss: 10 },
    { year: 2026, month: 1, quantityProduced: 2, profitLoss: 20 },
    { year: 2026, month: 2, quantityProduced: 4, profitLoss: 40 },
  ];

  it("adds the window up from the same rows the charts draw", () => {
    const total = sumTimelineMeasures(months.slice(1));

    expect(total.quantityProduced).toBe(6);
    expect(total.profitLoss).toBe(60);
  });

  it("sums an empty window to zeroes rather than nothing", () => {
    expect(sumTimelineMeasures([])).toMatchObject({ profitLoss: 0, salesTotal: 0 });
  });
});
