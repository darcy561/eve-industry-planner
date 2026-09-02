import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import {
  renderWithTheme,
  setViewportWide,
} from "../../../tests/archiveHarness.jsx";

const useArchivedJobsQuery = vi.fn();

vi.mock("../../Hooks/React Query/Backend/archivedJobsList", () => ({
  useArchivedJobsQuery: (...args) => useArchivedJobsQuery(...args),
  invalidateArchiveQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const { ArchivedJobsList } = await import("./ArchivedJobsList.jsx");

function renderList(props) {
  return renderWithTheme(      <ArchivedJobsList {...props} />);
}

const jobs = [
  {
    jobID: "job-a",
    name: "Rifter",
    archivedAt: "2026-08-21T00:00:00Z",
    measures: {
      jobCostTotal: 1000,
      profitLoss: 250,
      segment: "standaloneRecordedSale",
    },
  },
];

beforeEach(() => {
  useArchivedJobsQuery.mockReset();
  useArchivedJobsQuery.mockReturnValue({
    data: { jobs, paging: { totalJobs: 1 } },
    isLoading: false,
    isError: false,
  });
});

describe("ArchivedJobsList", () => {
  // Six columns cannot be read on a phone, and scrolling them sideways hides the
  // figures behind the name.
  it("uses cards on a narrow screen", () => {
    setViewportWide(false);
    const { container } = renderList();

    expect(container.querySelector("table")).toBeNull();
    // The card carries its own labels, since there is no header row above it.
    expect(screen.getAllByText("Job cost").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Profit / loss").length).toBeGreaterThan(0);
  });

  it("uses the table on a wide screen", () => {
    setViewportWide(true);
    const { container } = renderList();

    expect(container.querySelector("table")).not.toBeNull();
  });

  // The list is not queried until the tab holding it is opened.
  it("stays disabled until enabled", () => {
    setViewportWide(true);
    renderList({ enabled: false });

    expect(useArchivedJobsQuery.mock.calls[0][1]).toMatchObject({
      enabled: false,
    });
  });
});

// A job's own figures are written when it is archived, but they reach the
// account totals a fold later. The row says which side of that it is on, or a
// reader cannot tell a total that excludes this job from one that is simply
// smaller than they expected.
describe("jobs not yet in the totals", () => {
  function withAwaiting(awaitingTotals) {
    useArchivedJobsQuery.mockReturnValue({
      data: {
        jobs: [{ ...jobs[0], awaitingTotals }],
        paging: { totalJobs: 1 },
      },
      isLoading: false,
      isError: false,
    });
  }

  it("marks a job the server reports as awaiting totals", () => {
    setViewportWide(true);
    withAwaiting(true);
    renderList();

    expect(screen.getByText("Pending")).toBeTruthy();
    // The figures are shown regardless: they are the job's own and are correct.
    expect(screen.getByText("Market")).toBeTruthy();
  });

  it("marks nothing when the job is counted", () => {
    setViewportWide(true);
    withAwaiting(false);
    renderList();

    expect(screen.queryByText("Pending")).toBeNull();
  });

  // The field is omitted rather than sent as false, so an absent one must read
  // as counted rather than as unknown.
  it("treats an absent field as counted", () => {
    setViewportWide(true);
    useArchivedJobsQuery.mockReturnValue({
      data: { jobs, paging: { totalJobs: 1 } },
      isLoading: false,
      isError: false,
    });
    renderList();

    expect(screen.queryByText("Pending")).toBeNull();
  });

  it("marks it on the narrow layout too", () => {
    setViewportWide(false);
    withAwaiting(true);
    renderList();

    expect(screen.getByText("Pending")).toBeTruthy();
  });
});
