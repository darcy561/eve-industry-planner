import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { isMobile } = vi.hoisted(() => ({ isMobile: { current: false } }));

vi.mock("../../Hooks/Static/useItems", () => ({
  useItemNames: () => ({ 34: "Tritanium" }),
}));

vi.mock("../Charts", async (importOriginal) => ({
  ...(await importOriginal()),
  // Recharts measures itself, which jsdom cannot do; the window under test is
  // read from the slider and the footer instead.
  TimeSeriesChart: ({ rows }) => <div data-testid="chart">{rows.length}</div>,
}));

const { default: PriceHistoryLineGraph } = await import("./priceHistory.jsx");

const theme = createTheme();

/** Daily rows, oldest first, as the market history endpoint returns them. */
function history(rowCount, { from = "2026-01-01", priceFrom = 100 } = {}) {
  const start = new Date(`${from}T00:00:00Z`);
  return Array.from({ length: rowCount }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      highest: priceFrom + index + 2,
      lowest: priceFrom + index,
      average: priceFrom + index + 1,
      volume: 1000 + index,
    };
  });
}

function show(graphData, props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <PriceHistoryLineGraph
        graphData={graphData}
        typeID={34}
        regionID={10000002}
        updateRegionID={() => {}}
        {...props}
      />
    </ThemeProvider>,
  );
}

function again(graphData, props = {}) {
  return (
    <ThemeProvider theme={theme}>
      <PriceHistoryLineGraph
        graphData={graphData}
        typeID={34}
        regionID={10000002}
        updateRegionID={() => {}}
        {...props}
      />
    </ThemeProvider>
  );
}

/** The window the reader is looking at, as the slider reports it. */
function window_() {
  return screen
    .getAllByRole("slider")
    .map((thumb) => Number(thumb.getAttribute("aria-valuenow")));
}

// The chart names the region from the map it is handed — the only place it gets one, now that the
// store is not read here.
function heading() {
  return screen.getByText(/Price History For/).textContent;
}

function rowsCharted() {
  return Number(screen.getByTestId("chart").textContent);
}

beforeEach(() => {
  isMobile.current = false;
  // MUI reads the breakpoint through matchMedia; the shared setup stubs one
  // that always says no.
  vi.stubGlobal("matchMedia", (query) => ({
    // A getter, so a test can change the answer without the memoised query
    // list MUI holds on to going stale.
    get matches() {
      return isMobile.current && query.includes("max-width");
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }));
});

describe("the price history chart's visible window", () => {
  it("opens on the most recent month", () => {
    show(history(100));

    expect(window_()).toEqual([70, 99]);
    expect(rowsCharted()).toBe(30);
  });

  it("opens on the most recent week on a phone", () => {
    isMobile.current = true;

    show(history(100));

    expect(window_()).toEqual([93, 99]);
  });

  it("shows a short series whole", () => {
    show(history(5));

    expect(window_()).toEqual([0, 4]);
    expect(rowsCharted()).toBe(5);
  });

  it("says so when there is no history", () => {
    show([]);

    expect(
      screen.getByText("No history loaded for this range."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).toBeNull();
  });

  it("names the span the reader is looking at", () => {
    show(history(5, { from: "2026-03-01" }));

    expect(
      screen.getByText(/From Mar 01, 2026 through Mar 05, 2026/),
    ).toBeInTheDocument();
  });

  // The window indexes into the rows, so rows belonging to another item or
  // region must not be read through the previous item's window.
  it("goes back to the most recent month when the series changes", () => {
    const { rerender } = show(history(100));

    rerender(again(history(40, { from: "2025-06-01" })));

    expect(window_()).toEqual([10, 39]);
  });

  it("leaves the window alone when the same series is handed over again", () => {
    const rows = history(100);
    const { rerender } = show(rows);

    rerender(again([...rows]));

    expect(window_()).toEqual([70, 99]);
  });

  it("takes up the rows once they arrive", () => {
    const { rerender } = show([]);

    rerender(again(history(100)));

    expect(window_()).toEqual([70, 99]);
  });

  it("narrows to a week when the page becomes phone sized", () => {
    const rows = history(100);
    const { rerender } = show(rows);

    isMobile.current = true;
    rerender(again(rows));

    expect(window_()).toEqual([93, 99]);
  });
});

describe("the region the price history chart names", () => {
  it("names the region from the names it is given", () => {
    show(history(10), {
      regionNames: {
        10000002: { name: "The Forge", resolutionStatus: "resolved" },
      },
    });

    expect(heading()).toContain("in The Forge");
  });

  it("says the region is unknown when no name reached it", () => {
    show(history(10));

    expect(heading()).toContain("in Unknown Region");
  });
});
