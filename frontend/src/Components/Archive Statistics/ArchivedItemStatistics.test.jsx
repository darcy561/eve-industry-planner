import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import {
  renderWithTheme,
  setViewportWide,
} from "../../../tests/archiveHarness.jsx";

const useAccountTimelineQuery = vi.fn();
const useAccountTotalsQuery = vi.fn();
const onSelect = vi.fn();

vi.mock("../../Hooks/React Query/Backend/statisticsTimeline", () => ({
  useAccountTimelineQuery: (...args) => useAccountTimelineQuery(...args),
}));
vi.mock("../../Hooks/React Query/Backend/statisticsTotals", () => ({
  useAccountTotalsQuery: (...args) => useAccountTotalsQuery(...args),
}));

// The search is the planner's, over every buildable item. What matters here is
// that choosing one hands back an item id, not how the list is drawn.
vi.mock("../../Styled Components/autocomplete/virtualisedRecipeSearch", () => ({
  default: ({ onSelect: select }) => (
    <button type="button" onClick={() => select({ itemID: 34, name: "Tritanium" })}>
      pick an item
    </button>
  ),
}));

const { ArchivedItemStatistics } = await import("./ArchivedItemStatistics.jsx");

function renderTab(props) {
  return renderWithTheme(      <ArchivedItemStatistics onSelectItem={onSelect} item={null} {...props} />);
}

const tritanium = { typeID: 34, name: "Tritanium" };

const months = {
  months: [
    {
      year: 2026,
      month: 7,
      complete: true,
      quantityProduced: 10,
      quantitySold: 4,
      salesTotal: 8000,
      jobCostTotal: 5000,
      profitLoss: 3000,
      materialCostTotal: 3000,
      installCostTotal: 1000,
      inventionCostTotal: 500,
      extrasTotal: 500,
    },
  ],
};

// getAccountTotalsByTypeID unwraps the response and hands back the row itself.
// Mocking the envelope instead would pass while the component read nothing.
const totals = {
  typeID: 34,
  totalJobs: 12,
  itemBuildCount: 120,
  buildCostTotal: 60000,
  salesTotal: 90000,
  profitLoss: 30000,
  history: {
    buildCount: 12,
    firstCostMonth: { year: 2025, month: 3 },
    lastCostPerItem: 500,
    lastCostMonth: { year: 2026, month: 7 },
    cheapestCostPerItem: 400,
    cheapestCostMonth: { year: 2025, month: 6 },
    dearestCostPerItem: 700,
    dearestCostMonth: { year: 2026, month: 1 },
  },
};

beforeEach(() => {
  onSelect.mockReset();
  useAccountTimelineQuery.mockReturnValue({
    data: months,
    isLoading: false,
    isError: false,
  });
  useAccountTotalsQuery.mockReturnValue({ data: totals });
});

describe("ArchivedItemStatistics", () => {
  // Nothing is fetched for an item nobody has chosen, and the tab has to say so
  // rather than showing empty charts that read as "this item did nothing".
  it("asks for nothing and explains itself before an item is chosen", () => {
    renderTab({ item: null });

    expect(screen.getByText(/Search for an item/i)).toBeTruthy();
    expect(useAccountTimelineQuery.mock.calls[0][1]).toEqual({ enabled: false });
    expect(useAccountTotalsQuery.mock.calls[0][1]).toEqual({ enabled: false });
  });

  it("scopes both reads to the chosen item", () => {
    renderTab({ item: tritanium, from: "2026-01", to: "2026-08" });

    // The period is what is read, not what is kept from a wider read. Chain
    // builds are included, since an item only ever built as an intermediate keeps
    // its history in those buckets.
    expect(useAccountTimelineQuery).toHaveBeenCalledWith(
      {
        typeID: 34,
        from: "2026-01",
        to: "2026-08",
        includeProductionChain: true,
      },
      { enabled: true },
    );
    expect(useAccountTotalsQuery).toHaveBeenCalledWith(34, { enabled: true });
  });

  it("draws every chart the item has data for", () => {
    const { container } = renderTab({ item: tritanium });

    expect(screen.getByText("Cost and sale price per item")).toBeTruthy();
    expect(screen.getByText("Produced and sold")).toBeTruthy();
    expect(screen.getByText("Cost composition")).toBeTruthy();
    expect(screen.getByText("Profit by month")).toBeTruthy();
    // One chart per panel. The running total shares the profit chart rather than
    // sitting under it, because it is what those bars add up to.
    // jsdom performs no layout, so the marks inside a chart never render; the
    // wrapper count is what this harness can see. Four panels, four charts.
    expect(container.querySelectorAll(".recharts-wrapper").length).toBe(4);
  });

  // The figures are lifetime and the charts follow the range, so a range change
  // must not look like the item's history changed.
  // Reading a period chart against an all-time total invites a comparison the
  // two do not support, so each figure says which it is.
  it("separates the period figures from the all-time ones", () => {
    renderTab({ item: tritanium, from: "2026-07", to: "2026-07" });

    expect(screen.getByText("In this period")).toBeTruthy();
    expect(screen.getByText("All time")).toBeTruthy();

    // The period figures are the window the charts draw, summed.
    expect(screen.getByText("Items sold")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    // The all-time ones come from the lifetime row and do not move with it.
    expect(screen.getByText("Builds")).toBeTruthy();
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    // Whole things, so no decimals: a build count of "12.00" reads as a bug.
    expect(screen.queryByText("12.00")).toBeNull();
    expect(screen.getByText("First build")).toBeTruthy();
    expect(screen.getByText("2025-03")).toBeTruthy();
  });

  // Choosing from the search is what selects the item; the tab holds no list of
  // its own to fall out of step with it.
  it("reports the item the search hands back", async () => {
    const { getByText } = renderTab({ item: null });
    getByText("pick an item").click();

    expect(onSelect).toHaveBeenCalledWith({ typeID: 34, name: "Tritanium" });
  });

  // Built before, but not in this window: the figures still stand, so the charts
  // say the window is empty rather than the item is.
  it("says so when the window holds nothing for the item", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: { months: [] },
      isLoading: false,
      isError: false,
    });
    renderTab({ item: tritanium });

    expect(screen.getAllByText(/Nothing built in this period/i).length).toBe(4);
  });

  // Never built at all: four empty charts say less than one sentence.
  it("holds the page for an item with no archive at all", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: { months: [] },
      isLoading: false,
      isError: false,
    });
    // An item never built still returns a row, zeroed.
    useAccountTotalsQuery.mockReturnValue({
      data: { typeID: 34, totalJobs: 0, history: { buildCount: 0 } },
    });
    renderTab({ item: tritanium });

    expect(screen.getByText(/Nothing archived for Tritanium yet/i)).toBeTruthy();
    expect(screen.queryByText("Cost composition")).toBeNull();
  });
});
