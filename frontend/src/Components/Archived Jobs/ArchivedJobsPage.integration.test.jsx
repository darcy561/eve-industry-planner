import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import {
  archiveStoreState,
  chartCapture,
  chartMocks,
  drawnRowCounts,
  emptyArchiveListMock,
  monthsAcross,
  renderWithProviders,
  settledOn,
  timelineResponse,
  usersStoreMock,
} from "../../../tests/archiveHarness.jsx";

/**
 * The page with its real panels, hooks and adapters, faked only at the transport.
 *
 * The unit tests beside this one each hold their own half of a contract, which
 * is how a window meaning "let the server choose" could quietly become "no
 * filter" with both sides still passing. Here the halves meet.
 */

const getAccountTimeline = vi.fn();
const getAccountTimelineItems = vi.fn();

vi.mock("../../Functions/Endpoints/Private/statisticsTimeline.js", () => ({
  getAccountTimeline: (...args) => getAccountTimeline(...args),
  getAccountTimelineItems: (...args) => getAccountTimelineItems(...args),
}));
// getAccountTotalsByTypeID is the module's default export.
vi.mock("../../Functions/Endpoints/Private/statisticsTotals.js", () => ({
  default: vi.fn(async () => null),
  getAccountTotalsSummary: vi.fn(async () => null),
}));
vi.mock("../../Functions/Endpoints/Private/archivedJobsList", async () => {
  const { emptyArchiveListMock } = await import("../../../tests/archiveHarness.jsx");
  return emptyArchiveListMock();
});
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, archiveStoreState } = await import(
    "../../../tests/archiveHarness.jsx"
  );
  return usersStoreMock(archiveStoreState());
});
vi.mock("../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../../tests/archiveHarness.jsx");
  return cachedDataMock();
});
vi.mock("../../Styled Components/Charts", async () => {
  const { chartMocks } = await import("../../../tests/archiveHarness.jsx");
  return chartMocks();
});
// Page chrome pulls in the router; it is not what this exercises.
vi.mock("../../Styled Components/defaultPageLayout", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const { ArchivedJobsPage } = await import("./ArchivedJobsPage.jsx");

const HISTORY = monthsAcross(2025, 2026);

function timelineCalls() {
  return getAccountTimeline.mock.calls.map(([options]) => options ?? {});
}

/**
 * The endpoint as the server implements it: the window is applied there, so a
 * client that ignores the window it asked for draws the wrong months here too.
 */
function respond({ from, to, range } = {}) {
  if (range === "all") return timelineResponse(HISTORY);
  // No bounds is the server's own window: this month and the one before.
  if (!from || !to) return timelineResponse(HISTORY.slice(-2));
  const key = (row) => `${row.year}-${String(row.month).padStart(2, "0")}`;
  return timelineResponse(
    HISTORY.filter((row) => key(row) >= from && key(row) <= to),
  );
}

async function choosePeriod(label) {
  fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
  fireEvent.click(await screen.findByText(label));
}

beforeEach(() => {
  chartCapture.clear();
  getAccountTimeline.mockReset();
  getAccountTimelineItems.mockReset();
  getAccountTimeline.mockImplementation(async (options) => respond(options));
  getAccountTimelineItems.mockResolvedValue({
    period: {},
    paging: { totalItems: 0 },
    items: [],
  });
});

describe("the archive page, end to end", () => {
  // The regression this file exists for: the control said two months while the
  // panels drew every month there was.
  it("draws the window the control names", async () => {
    renderWithProviders(<ArchivedJobsPage />);
    await screen.findAllByTestId("chart");

    // 24 months held, 2 in the window. Drawing 24 is the failure this catches.
    await settledOn(2);
    expect(chartCapture.size).toBeGreaterThan(1);
  });

  it("asks for the default window by asking for no window at all", async () => {
    renderWithProviders(<ArchivedJobsPage />);
    await settledOn(2);

    // Unbounded is how the server is asked for its own comparison window, and
    // it is what the overview reads too — so the page opens on one entry.
    expect(timelineCalls().every((o) => !o.from && !o.to && !o.range)).toBe(true);
  });

  it("reads a window once however many panels plot months", async () => {
    renderWithProviders(<ArchivedJobsPage />);
    await settledOn(2);

    // Eight panels, the overview and the notice share the entry.
    expect(new Set(timelineCalls().map((o) => JSON.stringify(o))).size).toBe(1);
  });

  it("widens every chart together, on one further read", async () => {
    renderWithProviders(<ArchivedJobsPage />);
    await settledOn(2);
    const readsBefore = timelineCalls().length;

    await choosePeriod("All time");

    await settledOn(24);
    expect(timelineCalls().length).toBe(readsBefore + 1);
  });

  it("serves a window it has already read from the cache", async () => {
    renderWithProviders(<ArchivedJobsPage />);
    await settledOn(2);

    await choosePeriod("All time");
    await settledOn(24);
    const readsBefore = timelineCalls().length;
    await choosePeriod("Last 2 months");

    // Reachable a second time, and free: each window is its own cache entry.
    await settledOn(2);
    expect(timelineCalls().length).toBe(readsBefore);
  });

  it("opens an item's own view from a breakdown row", async () => {
    getAccountTimelineItems.mockResolvedValue({
      period: {},
      paging: { totalItems: 1 },
      items: [{ typeID: 34, jobCostTotal: 400, salesTotal: 1000, profitLoss: 600 }],
    });
    renderWithProviders(<ArchivedJobsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Type 34" }));

    expect(
      screen.getByRole("tab", { name: "Item Statistics" }),
    ).toHaveAttribute("aria-selected", "true");
    // The row hands the item over, so the tab opens on it rather than empty:
    // the name is on the breakdown row and again as the item panel's heading.
    expect((await screen.findAllByText("Type 34")).length).toBeGreaterThan(1);
  });

  it("says so when a rebuild is outstanding, and not when one is not", async () => {
    getAccountTimeline.mockResolvedValue({
      ...timelineResponse(HISTORY),
      recalculation: "recalculating",
    });
    const { unmount } = renderWithProviders(<ArchivedJobsPage />);
    expect(await screen.findByText(/being rebuilt/)).toBeInTheDocument();
    unmount();

    getAccountTimeline.mockResolvedValue(timelineResponse(HISTORY));
    renderWithProviders(<ArchivedJobsPage />);
    await screen.findAllByTestId("chart");
    expect(screen.queryByText(/being rebuilt/)).not.toBeInTheDocument();
  });

  it("reports a rebuild that failed as out of date rather than in progress", async () => {
    getAccountTimeline.mockResolvedValue({
      ...timelineResponse(HISTORY),
      recalculation: "failed",
    });
    renderWithProviders(<ArchivedJobsPage />);

    expect(await screen.findByText(/out of date/)).toBeInTheDocument();
    expect(screen.queryByText(/being rebuilt/)).not.toBeInTheDocument();
  });

  it("does not query the job list until its tab is opened", async () => {
    const { getArchivedJobs } = await import(
      "../../Functions/Endpoints/Private/archivedJobsList"
    );
    renderWithProviders(<ArchivedJobsPage />);
    await screen.findAllByTestId("chart");

    expect(getArchivedJobs).not.toHaveBeenCalled();
  });
});
