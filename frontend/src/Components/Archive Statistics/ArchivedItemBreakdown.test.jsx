import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../tests/archiveHarness.jsx";

const useAccountTimelineItemsQuery = vi.fn();
const getFullItemList = vi.fn();

vi.mock("../../Hooks/React Query/Backend/statisticsTimeline", () => ({
  useAccountTimelineItemsQuery: (...args) =>
    useAccountTimelineItemsQuery(...args),
}));

vi.mock("../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../../tests/archiveHarness.jsx");
  return cachedDataMock({ getFullItemList: (...args) => getFullItemList(...args) });
});

const { ArchivedItemBreakdown } = await import("./ArchivedItemBreakdown.jsx");

function page(items, totalItems = items.length) {
  return { data: { items, paging: { totalItems } }, isLoading: false };
}

const sampleItems = [
  {
    typeID: 23773,
    jobCostTotal: 12_000_000_000,
    salesTotal: 16_000_000_000,
    profitLoss: 4_000_000_000,
  },
  {
    typeID: 671,
    jobCostTotal: 3_000_000_000,
    salesTotal: 2_000_000_000,
    profitLoss: -1_000_000_000,
  },
];

beforeEach(() => {
  useAccountTimelineItemsQuery.mockReset();
  getFullItemList.mockReset();
  getFullItemList.mockResolvedValue({
    23773: { name: "Ragnarok" },
    671: { name: "Erebus" },
  });
});

describe("ArchivedItemBreakdown", () => {
  it("resolves type ids to item names", async () => {
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems));

    renderWithProviders(<ArchivedItemBreakdown />);

    await waitFor(() =>
      expect(screen.getByText("Ragnarok")).toBeInTheDocument(),
    );
    expect(screen.getByText("Erebus")).toBeInTheDocument();
  });

  // The name list is a single cached lookup. Resolving per row would repeat it
  // once per item for no gain.
  it("looks the item list up once for the whole page", async () => {
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems));

    renderWithProviders(<ArchivedItemBreakdown />);

    await waitFor(() =>
      expect(screen.getByText("Ragnarok")).toBeInTheDocument(),
    );
    expect(getFullItemList).toHaveBeenCalledTimes(1);
  });

  // The list is one read for the whole app rather than one per set of rows, so a
  // second panel asking gets the first panel's answer rather than a second fetch.
  it("shares one read of the list between the panels that need it", async () => {
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems));

    renderWithProviders(
      <>
        <ArchivedItemBreakdown />
        <ArchivedItemBreakdown />
      </>,
    );

    await waitFor(() =>
      expect(screen.getAllByText("Ragnarok").length).toBeGreaterThan(1),
    );
    expect(getFullItemList).toHaveBeenCalledTimes(1);
  });

  // A missing name must not hide the row: the figures are still meaningful
  // against the type id.
  it("falls back to the type id when a name is unknown", async () => {
    getFullItemList.mockResolvedValue({});
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems));

    renderWithProviders(<ArchivedItemBreakdown />);

    await waitFor(() =>
      expect(screen.getByText("Type 23773")).toBeInTheDocument(),
    );
  });

  // Ranking happens on the server, so the sort is a request parameter. Sorting
  // the returned array instead would only reorder the page, leaving the rest of
  // the account's items unconsidered.
  it("asks the server for the ranking rather than sorting the page", async () => {
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems));

    renderWithProviders(<ArchivedItemBreakdown />);

    expect(useAccountTimelineItemsQuery.mock.calls[0][0]).toMatchObject({
      sort: "profitLoss",
    });

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Total Cost" }));

    await waitFor(() => {
      const latest = useAccountTimelineItemsQuery.mock.calls.at(-1)[0];
      expect(latest.sort).toBe("jobCostTotal");
    });
  });

  // Two lengths, not a growing list: the toggle asks the server for ten rows and
  // back again rather than accumulating.
  it("toggles between five and ten rows", async () => {
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems, 40));

    renderWithProviders(<ArchivedItemBreakdown />);
    expect(useAccountTimelineItemsQuery.mock.calls[0][0].limit).toBe(5);

    fireEvent.click(screen.getByRole("button", { name: "Show top 10" }));
    await waitFor(() => {
      expect(useAccountTimelineItemsQuery.mock.calls.at(-1)[0].limit).toBe(10);
    });

    fireEvent.click(screen.getByRole("button", { name: "Show top 5" }));
    await waitFor(() => {
      expect(useAccountTimelineItemsQuery.mock.calls.at(-1)[0].limit).toBe(5);
    });
  });

  // Collapsing has to animate, and the shorter page can arrive from the cache in
  // the same tick. The rows being faded out must survive that, or the table
  // snaps shut instead of closing.
  it("keeps the extra rows on screen while they fade out", async () => {
    const tenItems = Array.from({ length: 10 }, (_, i) => ({
      typeID: 1000 + i,
      jobCostTotal: 1,
      salesTotal: 2,
      profitLoss: 1,
    }));
    getFullItemList.mockResolvedValue(
      Object.fromEntries(tenItems.map((item) => [item.typeID, { name: `Item ${item.typeID}` }])),
    );
    useAccountTimelineItemsQuery.mockReturnValue(page(tenItems, 40));

    renderWithProviders(<ArchivedItemBreakdown />);
    fireEvent.click(screen.getByRole("button", { name: "Show top 10" }));
    await waitFor(() => expect(screen.getByText("Item 1009")).toBeInTheDocument());

    // The shorter page lands immediately, as a cached one would.
    useAccountTimelineItemsQuery.mockReturnValue(page(tenItems.slice(0, 5), 40));
    fireEvent.click(screen.getByRole("button", { name: "Show top 5" }));

    // Still drawn, mid-fade, rather than removed on the spot.
    expect(screen.getByText("Item 1009")).toBeInTheDocument();

    await waitFor(
      () => expect(screen.queryByText("Item 1009")).not.toBeInTheDocument(),
      { timeout: 2000 },
    );
    expect(screen.getByText("Item 1000")).toBeInTheDocument();
  });

  // A new ranking is a new list, so an expansion made against the old order
  // should not carry over.
  it("collapses when the ranking changes", async () => {
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems, 40));

    renderWithProviders(<ArchivedItemBreakdown />);

    fireEvent.click(screen.getByRole("button", { name: "Show top 10" }));
    await waitFor(() => {
      expect(useAccountTimelineItemsQuery.mock.calls.at(-1)[0].limit).toBe(10);
    });

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Total Cost" }));

    await waitFor(() => {
      expect(useAccountTimelineItemsQuery.mock.calls.at(-1)[0].limit).toBe(5);
    });
  });

  // totalItems counts every item type in the window, so it decides whether an
  // expansion would show anything the collapsed table does not.
  it("offers the longer view only when the window holds more than five items", () => {
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems, 40));
    const { unmount } = renderWithProviders(<ArchivedItemBreakdown />);
    expect(
      screen.getByRole("button", { name: "Show top 10" }),
    ).toBeInTheDocument();
    unmount();

    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems, 5));
    renderWithProviders(<ArchivedItemBreakdown />);
    expect(
      screen.queryByRole("button", { name: /Show top/ }),
    ).not.toBeInTheDocument();
  });

  // A dashboard glance, not an analysis tool: two rankings and five rows. More
  // options belong in a fuller view rather than here.
  it("offers exactly two rankings", () => {
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems));

    renderWithProviders(<ArchivedItemBreakdown />);
    fireEvent.mouseDown(screen.getByRole("combobox"));

    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Total Profit", "Total Cost"]);
  });

  it("starts at five rows", () => {
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems, 40));

    renderWithProviders(<ArchivedItemBreakdown />);

    expect(useAccountTimelineItemsQuery.mock.calls[0][0].limit).toBe(5);
  });

  it("says so when the window is empty rather than showing an empty table", () => {
    useAccountTimelineItemsQuery.mockReturnValue(page([]));

    renderWithProviders(<ArchivedItemBreakdown />);

    expect(
      screen.getByText("Nothing archived in this period yet."),
    ).toBeInTheDocument();
  });

  it("shows placeholders while loading rather than an empty state", () => {
    useAccountTimelineItemsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { container } = renderWithProviders(<ArchivedItemBreakdown />);

    expect(
      screen.queryByText("Nothing archived in this period yet."),
    ).not.toBeInTheDocument();
    expect(
      container.querySelectorAll(".MuiSkeleton-root").length,
    ).toBeGreaterThan(0);
  });

  // A caller with its own range control passes one, so the table agrees with the
  // rest of that page rather than showing the server's default window.
  it("passes a caller's range through", async () => {
    useAccountTimelineItemsQuery.mockReturnValue(page(sampleItems));
    getFullItemList.mockResolvedValue([]);

    renderWithProviders(<ArchivedItemBreakdown from="2026-01" to="2026-06" />);

    await waitFor(() =>
      expect(useAccountTimelineItemsQuery.mock.calls[0][0]).toMatchObject({
        from: "2026-01",
        to: "2026-06",
      }),
    );
  });
});
