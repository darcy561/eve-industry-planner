import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { screen, fireEvent } from "@testing-library/react";
import {
  chartCapture,
  drawnRowCounts,
  monthRow,
  renderWithProviders,
  settledOn,
  timelineResponse,
} from "../../../tests/archiveHarness.jsx";

/**
 * The item tab with its real hooks and adapters: choosing an item, narrowing the
 * period, and what each of those asks the server for.
 */

const getAccountTimeline = vi.fn();
const getAccountTotalsByTypeID = vi.fn();

vi.mock("../../Functions/Endpoints/Private/statisticsTimeline.js", () => ({
  getAccountTimeline: (...args) => getAccountTimeline(...args),
  getAccountTimelineItems: vi.fn(async () => ({ items: [], paging: {} })),
}));
// getAccountTotalsByTypeID is the module's default export; a named stub would
// leave the hook reading the default and finding nothing.
vi.mock("../../Functions/Endpoints/Private/statisticsTotals.js", () => ({
  default: (...args) => getAccountTotalsByTypeID(...args),
  getAccountTotalsSummary: vi.fn(async () => null),
}));
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, archiveStoreState } = await import(
    "../../../tests/archiveHarness.jsx"
  );
  return usersStoreMock(archiveStoreState());
});
vi.mock("../../Styled Components/Charts", async () => {
  const { chartMocks } = await import("../../../tests/archiveHarness.jsx");
  return chartMocks();
});
// The planner's search is exercised where it lives; what matters here is what
// the tab does with a chosen item.
vi.mock("../../Styled Components/autocomplete/virtualisedRecipeSearch", () => ({
  default: ({ onSelect }) => (
    <button type="button" onClick={() => onSelect({ itemID: 34, name: "Tritanium" })}>
      pick Tritanium
    </button>
  ),
}));

const { ArchivedItemStatistics } = await import("./ArchivedItemStatistics.jsx");

const HISTORY = [
  monthRow(2026, 1),
  monthRow(2026, 2),
  monthRow(2026, 3),
  monthRow(2026, 4),
];

const TOTALS = {
  typeID: 34,
  totalJobs: 9,
  itemBuildCount: 90,
  buildCostTotal: 5000,
  salesTotal: 9000,
  profitLoss: 4000,
  history: {
    buildCount: 9,
    firstCostMonth: { year: 2025, month: 3 },
    lastCostPerItem: 500,
    lastCostMonth: { year: 2026, month: 4 },
    cheapestCostPerItem: 400,
    cheapestCostMonth: { year: 2025, month: 6 },
    dearestCostPerItem: 700,
    dearestCostMonth: { year: 2026, month: 1 },
  },
};

function renderTab(props = {}) {
  function Harness() {
    const [item, setItem] = useState(null);
    return (
      <ArchivedItemStatistics
        item={item}
        onSelectItem={setItem}
        rangeKey="default"
        onRangeChange={() => {}}
        {...props}
      />
    );
  }
  return renderWithProviders(<Harness />);
}

beforeEach(() => {
  chartCapture.clear();
  getAccountTimeline.mockReset();
  getAccountTotalsByTypeID.mockReset();
  getAccountTimeline.mockResolvedValue(timelineResponse(HISTORY));
  getAccountTotalsByTypeID.mockResolvedValue(TOTALS);
});

describe("the item statistics tab, end to end", () => {
  it("asks for nothing until an item is chosen", async () => {
    renderTab();

    expect(await screen.findByText(/Search for an item/i)).toBeInTheDocument();
    expect(getAccountTimeline).not.toHaveBeenCalled();
    expect(getAccountTotalsByTypeID).not.toHaveBeenCalled();
  });

  it("draws the item's charts once one is chosen", async () => {
    renderTab();
    fireEvent.click(screen.getByText("pick Tritanium"));

    await screen.findAllByTestId("chart");
    expect(screen.getByText("Cost composition")).toBeInTheDocument();
    // Four panels, one chart each: the running total shares the profit chart.
    expect(chartCapture.size).toBe(4);
  });

  // Chain builds are the whole history for an item only ever built as an
  // intermediate, and the read is the item's whole history in one go.
  it("reads the item, chain builds included", async () => {
    renderTab();
    fireEvent.click(screen.getByText("pick Tritanium"));
    await screen.findAllByTestId("chart");

    // Chain output counts here and nowhere else: an item only ever built as an
    // intermediate keeps its whole history in those buckets.
    expect(getAccountTimeline).toHaveBeenCalledWith({
      typeID: 34,
      includeProductionChain: true,
    });
  });

  it("asks for the period it is showing rather than trimming a wider read", async () => {
    renderTab({ from: "2026-03", to: "2026-04" });
    fireEvent.click(screen.getByText("pick Tritanium"));
    await screen.findAllByTestId("chart");

    expect(getAccountTimeline).toHaveBeenCalledWith({
      typeID: 34,
      from: "2026-03",
      to: "2026-04",
      includeProductionChain: true,
    });
  });

  // Lifetime figures do not move with the period; the ones above the charts do.
  it("shows lifetime marks beside the period figures", async () => {
    renderTab();
    fireEvent.click(screen.getByText("pick Tritanium"));

    // The marks come from the lifetime read, which settles separately.
    expect(await screen.findByText("2025-03")).toBeInTheDocument();
    expect(screen.getByText("In this period")).toBeInTheDocument();
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("holds the page for an item with nothing archived", async () => {
    getAccountTimeline.mockResolvedValue(timelineResponse([]));
    getAccountTotalsByTypeID.mockResolvedValue({
      typeID: 34,
      totalJobs: 0,
      history: { buildCount: 0 },
    });
    renderTab();
    fireEvent.click(screen.getByText("pick Tritanium"));

    expect(await screen.findByText(/Nothing archived for Tritanium/i)).toBeInTheDocument();
    expect(screen.queryByText("Cost composition")).toBeNull();
  });
});
