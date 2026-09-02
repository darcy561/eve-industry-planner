import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../../../tests/archiveHarness.jsx";

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
  RecalculationNotice: () => null,
}));

vi.mock("../../Styled Components/defaultPageLayout", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const { ArchivedJobsPage } = await import("./ArchivedJobsPage.jsx");

function renderPage() {
  return renderWithTheme(      <ArchivedJobsPage />);
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

    // The last render of each panel, not every render: the page starts on a
    // window of its own, so accumulating calls compares two selections.
    const latest = new Map();
    for (const call of panelCalls) latest.set(call.name, call.props);

    const ranged = [...latest.values()].filter((props) => props.from);
    expect(ranged.length).toBeGreaterThan(0);
    const windows = new Set(ranged.map((p) => `${p.from}:${p.to}`));
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
