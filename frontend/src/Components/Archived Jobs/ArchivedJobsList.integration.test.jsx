import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../tests/archiveHarness.jsx";

/** The archive list with its real query hook, faked only at the transport. */

const getArchivedJobs = vi.fn();

vi.mock("../../Functions/Endpoints/Private/archivedJobsList", () => ({
  getArchivedJobs: (...args) => getArchivedJobs(...args),
  getArchivedJob: vi.fn(async () => null),
}));
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, archiveStoreState } = await import(
    "../../../tests/archiveHarness.jsx"
  );
  return usersStoreMock(archiveStoreState());
});

const { ArchivedJobsList } = await import("./ArchivedJobsList.jsx");

function page(jobs) {
  return { jobs, paging: { totalJobs: jobs.length } };
}

const COUNTED = {
  jobID: "job-counted",
  name: "Rifter",
  archivedAt: "2026-08-21T00:00:00Z",
  measures: { jobCostTotal: 1000, profitLoss: 250, segment: "standaloneRecordedSale" },
};

beforeEach(() => {
  getArchivedJobs.mockReset();
  getArchivedJobs.mockResolvedValue(page([COUNTED]));
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: true,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

describe("the archived jobs list, end to end", () => {
  it("reads a page and draws its rows", async () => {
    renderWithProviders(<ArchivedJobsList enabled />);

    expect(await screen.findByText("Rifter")).toBeInTheDocument();
    expect(screen.getByText("Market")).toBeInTheDocument();
    expect(getArchivedJobs).toHaveBeenCalled();
  });

  // A job's own figures are written when it is archived; they reach the account
  // totals a fold later, and the row says which side of that it is on.
  it("marks a job whose figures are not in the totals yet", async () => {
    getArchivedJobs.mockResolvedValue(
      page([COUNTED, { ...COUNTED, jobID: "job-pending", name: "Hobgoblin II", awaitingTotals: true }]),
    );
    renderWithProviders(<ArchivedJobsList enabled />);

    await screen.findByText("Hobgoblin II");
    // One row pending, one counted: a mark on both would say nothing.
    expect(screen.getAllByText("Pending")).toHaveLength(1);
  });

  it("asks for nothing while it is disabled", async () => {
    renderWithProviders(<ArchivedJobsList enabled={false} />);

    expect(getArchivedJobs).not.toHaveBeenCalled();
  });
});
