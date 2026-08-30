import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const panelCalls = [];
function stubPanel(name) {
  return (props) => {
    panelCalls.push({ name, props });
    return <div data-testid={name} />;
  };
}

vi.mock("../Archive Statistics", () => ({
  ArchivedStatsOverview: stubPanel("overview"),
  ArchivedItemBreakdown: stubPanel("breakdown"),
  ArchiveTimelinePanel: stubPanel("timeline"),
  ArchiveCumulativePanel: stubPanel("cumulative"),
  ArchiveItemChartPanel: stubPanel("items"),
  ArchiveSegmentPanel: stubPanel("segment"),
  ArchiveExtrasPanel: stubPanel("extras"),
  ArchiveExtrasTotalsPanel: stubPanel("extrasTotals"),
  ArchiveCostBreakdownPanel: stubPanel("costBreakdown"),
  ArchiveCostTotalsPanel: stubPanel("costTotals"),
}));

vi.mock("../../Styled Components/defaultPageLayout", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const { ArchivedJobsPage } = await import("./ArchivedJobsPage.jsx");

// useMediaQuery reads breakpoints off the theme, so one has to be in context.
const theme = createTheme();
function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <ArchivedJobsPage />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  panelCalls.length = 0;
});

describe("ArchivedJobsPage", () => {
  it("opens on the statistics tab", () => {
    renderPage();
    expect(screen.getByTestId("timeline")).toBeInTheDocument();
  });

  // The charts are why most people open the page, so they load immediately.
  it("renders every statistics panel on load", () => {
    renderPage();
    for (const name of [
      "overview",
      "timeline",
      "cumulative",
      "segment",
      "items",
      "extras",
      "extrasTotals",
      "costBreakdown",
      "costTotals",
      "breakdown",
    ]) {
      expect(screen.getByTestId(name)).toBeInTheDocument();
    }
  });

  // One selection drives every panel, so the figures on the page agree with
  // each other rather than describing different periods.
  it("passes one range to every panel that takes one", () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Last 12 months"));

    const ranged = panelCalls.filter((call) => call.props.from);
    expect(ranged.length).toBeGreaterThan(0);
    const windows = new Set(ranged.map((c) => `${c.props.from}:${c.props.to}`));
    expect(windows.size).toBe(1);
  });

  // The segment split describes the archive as a whole rather than a window,
  // because the segment a job belongs to is a property of the job.
  it("does not narrow the segment split to the range", () => {
    renderPage();
    const segment = panelCalls.filter((c) => c.name === "segment").at(-1);
    expect(segment.props.from).toBeUndefined();
  });
});
