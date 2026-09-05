import { describe, it, expect } from "vitest";
import { mapApiStatsToArchiveBreakdown } from "./mapApiStatsToArchiveBreakdown";

/**
 * A segment as the API serves it. jobCostTotal includes both fee totals, matching
 * the server's definition.
 */
function segment(overrides = {}) {
  return {
    totalJobs: 1,
    itemBuildCount: 10,
    jobCostTotal: 0,
    totalSoldQuantity: 0,
    salesTotal: 0,
    brokersFeeTotal: 0,
    transactionFeeTotal: 0,
    profitLoss: 0,
    ...overrides,
  };
}

describe("mapApiStatsToArchiveBreakdown", () => {
  it("returns null when the row carries no breakdown", () => {
    expect(mapApiStatsToArchiveBreakdown(null)).toBeNull();
    expect(mapApiStatsToArchiveBreakdown({})).toBeNull();
    expect(mapApiStatsToArchiveBreakdown({ breakdown: null })).toBeNull();
  });

  it("maps the API segment names onto the display blocks", () => {
    const result = mapApiStatsToArchiveBreakdown({
      typeID: 23773,
      jobType: 1,
      breakdown: {
        productionChain: segment({ totalJobs: 3 }),
        retainedStock: segment({ totalJobs: 5 }),
        standaloneRecordedSale: segment({ totalJobs: 7 }),
      },
    });

    expect(result.productionChain.totalJobs).toBe(3);
    expect(result.retainedFullStock.totalJobs).toBe(5);
    expect(result.standaloneWithRecordedSale.totalJobs).toBe(7);
    expect(result.combined.typeID).toBe(23773);
    expect(result.combined.jobType).toBe(1);
  });

  // The segments partition the jobs, so Combined must equal their sum — a reader
  // comparing the top block against the three below it should find them agreeing.
  it("sums the segments into Combined", () => {
    const result = mapApiStatsToArchiveBreakdown({
      breakdown: {
        productionChain: segment({ totalJobs: 1, itemBuildCount: 10, jobCostTotal: 100 }),
        retainedStock: segment({ totalJobs: 2, itemBuildCount: 20, jobCostTotal: 200 }),
        standaloneRecordedSale: segment({
          totalJobs: 4,
          itemBuildCount: 40,
          jobCostTotal: 400,
          salesTotal: 900,
          totalSoldQuantity: 40,
        }),
      },
    });

    expect(result.combined.totalJobs).toBe(7);
    expect(result.combined.itemBuildCount).toBe(70);
    expect(result.combined.jobCostTotal).toBe(700);
    expect(result.combined.salesTotal).toBe(900);
    expect(result.combined.totalSoldQuantity).toBe(40);
  });

  // jobCostTotal already contains both fee totals. Recomputing Combined profit as
  // sales − brokers − transaction − jobCost subtracts them twice and turns a
  // profitable type into a reported loss.
  it("carries segment profit through without subtracting fees again", () => {
    const result = mapApiStatsToArchiveBreakdown({
      breakdown: {
        productionChain: segment(),
        retainedStock: segment(),
        standaloneRecordedSale: segment({
          // 1000 build + 50 brokers + 30 transaction
          jobCostTotal: 1080,
          brokersFeeTotal: 50,
          transactionFeeTotal: 30,
          salesTotal: 1500,
          totalSoldQuantity: 10,
          profitLoss: 420,
        }),
      },
    });

    expect(result.combined.profitLoss).toBe(420);
    // What the double-subtraction would have produced.
    expect(result.combined.profitLoss).not.toBe(340);
  });

  it("treats missing segments and fields as zero rather than NaN", () => {
    const result = mapApiStatsToArchiveBreakdown({ breakdown: {} });

    expect(result.combined.totalJobs).toBe(0);
    expect(result.combined.profitLoss).toBe(0);
    expect(Number.isNaN(result.combined.jobCostTotal)).toBe(false);
  });
});
