import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ArchiveStatsBreakdown from "./ArchiveStatsBreakdown";
import { mapApiStatsToArchiveBreakdown } from "./mapApiStatsToArchiveBreakdown";

function segment(overrides = {}) {
  return {
    totalJobs: 0,
    itemBuildCount: 0,
    jobCostTotal: 0,
    totalSoldQuantity: 0,
    salesTotal: 0,
    brokersFeeTotal: 0,
    transactionFeeTotal: 0,
    profitLoss: 0,
    ...overrides,
  };
}

function breakdownOf({ chain, stock, market } = {}) {
  return mapApiStatsToArchiveBreakdown({
    typeID: 23773,
    breakdown: {
      productionChain: segment(chain),
      retainedStock: segment(stock),
      standaloneRecordedSale: segment(market),
    },
  });
}

describe("ArchiveStatsBreakdown", () => {
  it("renders nothing without a breakdown", () => {
    const { container } = render(<ArchiveStatsBreakdown breakdown={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  // Zeros are noise: a reader who never built through a chain should not have to
  // read a block of noughts to learn that.
  it("omits segments with no activity", () => {
    render(
      <ArchiveStatsBreakdown
        breakdown={breakdownOf({
          market: { totalJobs: 4, itemBuildCount: 40, jobCostTotal: 400 },
        })}
      />
    );

    expect(screen.getByText(/^Market —/)).toBeInTheDocument();
    expect(screen.queryByText(/^Chain —/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Stock —/)).not.toBeInTheDocument();
  });

  // Stock and Chain jobs record no sale of their own, so sale and fee rows there
  // would be zeros standing beside real build costs.
  it("shows sale figures for Market but not for Stock or Chain", () => {
    render(
      <ArchiveStatsBreakdown
        breakdown={breakdownOf({
          market: {
            totalJobs: 1,
            itemBuildCount: 10,
            jobCostTotal: 100,
            salesTotal: 500,
            totalSoldQuantity: 10,
          },
          stock: { totalJobs: 2, itemBuildCount: 20, jobCostTotal: 200 },
          chain: { totalJobs: 3, itemBuildCount: 30, jobCostTotal: 300 },
        })}
      />
    );

    // Combined and Market both carry the full metric set.
    expect(screen.getAllByText("Sales total")).toHaveLength(2);
    expect(screen.getAllByText("Job cost total")).toHaveLength(4);
    expect(screen.getByText(/chain steps feed the next blueprint/)).toBeInTheDocument();
    expect(screen.getByText(/recorded no sale or broker fee/)).toBeInTheDocument();
  });

  // Nothing sold is not the same as everything selling for nothing.
  it("dashes the average sale when nothing sold", () => {
    render(
      <ArchiveStatsBreakdown
        breakdown={breakdownOf({
          market: { totalJobs: 1, itemBuildCount: 10, jobCostTotal: 100 },
        })}
      />
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("always shows Combined when any segment has activity", () => {
    render(
      <ArchiveStatsBreakdown
        breakdown={breakdownOf({
          chain: { totalJobs: 3, itemBuildCount: 30, jobCostTotal: 300 },
        })}
      />
    );

    expect(screen.getByText(/^Combined —/)).toBeInTheDocument();
  });
});
