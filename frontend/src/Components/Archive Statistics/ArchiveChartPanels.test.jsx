import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import {
  chartCapture,
  chartRenders,
  lastChart,
  monthRow,
  renderWithProviders,
} from "../../../tests/archiveHarness.jsx";
import { COST_COMPONENTS } from "./chartAdapters.js";

/**
 * What each panel asks the primitive to draw.
 *
 * The adapters are tested on their rows and the primitives on their marks; this
 * is the join between them — the series a panel names, the key it plots against,
 * and what it shows when there is nothing to plot. A panel that hands over the
 * right rows under the wrong series draws an empty chart and no test above or
 * below this notices.
 */

const useAccountTimelineQuery = vi.fn();
const useAccountTimelineItemsQuery = vi.fn();
const useAccountTotalsSummaryQuery = vi.fn();

vi.mock("../../Hooks/React Query/Backend/statisticsTimeline", () => ({
  useAccountTimelineQuery: (...args) => useAccountTimelineQuery(...args),
  useAccountTimelineItemsQuery: (...args) => useAccountTimelineItemsQuery(...args),
}));
vi.mock("../../Hooks/React Query/Backend/statisticsTotals", () => ({
  useAccountTotalsSummaryQuery: (...args) => useAccountTotalsSummaryQuery(...args),
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
// The panels resolve item names from the cached static list, the way the rest
// of the app reads it.
vi.mock("../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../../tests/archiveHarness.jsx");
  return cachedDataMock({ getFullItemList: vi.fn(async () => ({ 34: { name: "Tritanium" } })) });
});

const panels = await import("./ArchiveChartPanels.jsx");

const MONTHS = [monthRow(2026, 7), monthRow(2026, 8)];

function settled(data) {
  return { data, isLoading: false, isError: false };
}

beforeEach(() => {
  chartCapture.clear();
  chartRenders.length = 0;
  useAccountTimelineQuery.mockReturnValue(settled({ months: MONTHS }));
  useAccountTimelineItemsQuery.mockReturnValue(
    settled({ items: [{ typeID: 34, profitLoss: 100, jobCostTotal: 40, salesTotal: 140 }] }),
  );
  useAccountTotalsSummaryQuery.mockReturnValue(
    settled({ breakdown: { standaloneRecordedSale: { jobCostTotal: 10, salesTotal: 20, totalJobs: 1 } } }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("what each month panel plots", () => {
  const cases = [
    {
      name: "monthly totals",
      Panel: panels.ArchiveTimelinePanel,
      series: ["jobCostTotal", "salesTotal", "profitLoss"],
    },
    {
      name: "cumulative profit",
      Panel: panels.ArchiveCumulativePanel,
      series: ["cumulativeProfit"],
    },
    {
      name: "cost components",
      Panel: panels.ArchiveCostBreakdownPanel,
      // Read from the list rather than restated, so a component added there has
      // to be plotted rather than only defined.
      series: COST_COMPONENTS.map((c) => c.key),
    },
  ];

  for (const { name, Panel, series } of cases) {
    it(`plots ${name} against the month`, () => {
      renderWithProviders(<Panel from="2026-07" to="2026-08" />);
      const chart = lastChart("time");

      expect(chart.categoryKey).toBe("month");
      expect(chart.series.map((s) => s.key)).toEqual(series);
      expect(chart.rows).toHaveLength(MONTHS.length);
      // Panels label their own axis: a month in progress has to read as one.
      expect(typeof chart.formatCategory).toBe("function");
    });
  }

  it("draws one row per month of the window it was given", () => {
    renderWithProviders(<panels.ArchiveTimelinePanel from="2026-07" to="2026-08" />);

    expect(lastChart("time").rows.map((r) => r.month)).toEqual(["2026-07", "2026-08"]);
  });
});

describe("what a panel shows with nothing to draw", () => {
  it("says so rather than drawing an empty chart", () => {
    useAccountTimelineQuery.mockReturnValue(settled({ months: [] }));
    renderWithProviders(<panels.ArchiveTimelinePanel />);

    expect(screen.getByText("No archived jobs in this period.")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("draws nothing while the read is in flight", () => {
    useAccountTimelineQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderWithProviders(<panels.ArchiveCumulativePanel />);

    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("draws nothing when the read failed", () => {
    useAccountTimelineQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderWithProviders(<panels.ArchiveCostBreakdownPanel />);

    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });
});

describe("the pie panels", () => {
  it("splits the period's items by the measure chosen", async () => {
    renderWithProviders(<panels.ArchiveItemChartPanel from="2026-07" to="2026-08" />);

    expect(lastChart("pie").categoryKey).toBe("name");
    expect(lastChart("pie").valueKey).toBe("value");
    // The name arrives with the static list, a tick after the figures.
    await vi.waitFor(() => expect(lastChart("pie").rows[0].name).toBe("Tritanium"));
  });

  it("asks the server to rank by the measure the reader picked", () => {
    renderWithProviders(<panels.ArchiveItemChartPanel />);
    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    fireEvent.click(screen.getByText("By cost"));

    // The server ranks and pages, so a new measure is a new request rather than
    // a re-sort of the page already held.
    expect(useAccountTimelineItemsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "jobCostTotal" }),
    );
  });

  // An empty period and a period where nothing profited are different answers,
  // and a reader who sees "no archived jobs" would go looking for missing data.
  it("separates a period with no jobs from one where nothing profited", () => {
    useAccountTimelineItemsQuery.mockReturnValue(
      settled({ items: [{ typeID: 34, profitLoss: -100 }] }),
    );
    renderWithProviders(<panels.ArchiveItemChartPanel />);

    expect(screen.getByText(/No item returned a positive profit/i)).toBeInTheDocument();
  });

  // Lifetime rather than the window: which segment a job belongs to is a
  // property of the job, so the split describes the archive as a whole.
  it("reads the segment split from lifetime totals, not the window", () => {
    renderWithProviders(<panels.ArchiveSegmentPanel from="2026-07" to="2026-08" />);

    expect(useAccountTotalsSummaryQuery).toHaveBeenCalled();
    expect(lastChart("pie").categoryKey).toBe("segment");
  });

  it("says nothing is archived rather than drawing an empty split", () => {
    useAccountTotalsSummaryQuery.mockReturnValue(settled({ breakdown: {} }));
    renderWithProviders(<panels.ArchiveSegmentPanel />);

    expect(screen.getByText("Nothing archived yet.")).toBeInTheDocument();
  });
});

describe("the extras panels", () => {
  it("names a series per category the window used", () => {
    useAccountTimelineQuery.mockReturnValue(
      settled({
        months: [monthRow(2026, 8, { extraCategoryTotals: { 0: 5, 7: 3 } })],
      }),
    );
    renderWithProviders(<panels.ArchiveExtrasPanel from="2026-08" to="2026-08" />);

    expect(lastChart("time").series.length).toBe(2);
  });

  it("says so when no extras were recorded", () => {
    renderWithProviders(<panels.ArchiveExtrasTotalsPanel />);

    expect(
      screen.getByText("No extra costs recorded in this period."),
    ).toBeInTheDocument();
  });
});
