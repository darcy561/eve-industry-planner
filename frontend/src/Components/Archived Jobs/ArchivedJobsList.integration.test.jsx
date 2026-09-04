import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../tests/archiveHarness.jsx";

/** The archive list with its real query hook, faked only at the transport. */

const getArchivedJobs = vi.fn();

vi.mock("../../Functions/Endpoints/Private/archivedJobsList", async () => {
  const { emptyArchiveListMock } = await import("../../../tests/archiveHarness.jsx");
  return { ...emptyArchiveListMock(), getArchivedJobs: (...args) => getArchivedJobs(...args) };
});
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

  it("draws a stale row as stale rather than as waiting", async () => {
    getArchivedJobs.mockResolvedValue(
      page([
        COUNTED,
        {
          ...COUNTED,
          jobID: "job-stale",
          name: "Warrior II",
          awaitingTotals: true,
          figuresStale: true,
        },
      ]),
    );
    renderWithProviders(<ArchivedJobsList enabled />);

    // The row the rebuild could not read says so; the one beside it says
    // nothing, so the mark belongs to a job rather than to the page.
    expect(await screen.findByText("Stale")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  // The dialogue reads its months when it mounts, so a list that keeps it
  // mounted from the start opens every job on the months of no job at all.
  it("opens the months dialogue on the row's own months", async () => {
    getArchivedJobs.mockResolvedValue(
      page([{ ...COUNTED, costMonth: "2026-08", salesMonth: "2026-07" }]),
    );
    renderWithProviders(<ArchivedJobsList enabled />);

    fireEvent.click(await screen.findByRole("button", { name: "Months" }));

    expect(
      await screen.findByRole("group", { name: "Costs count in" }),
    ).toHaveTextContent("2026-08");
    expect(screen.getByRole("group", { name: "Sales count in" })).toHaveTextContent(
      "2026-07",
    );
  });

  // A set archived together is corrected together: the request names the group
  // rather than walking its members one at a time.
  it("files a whole group from the block header", async () => {
    const { fileArchivedJobMonths } = await import(
      "../../Functions/Endpoints/Private/archivedJobsList"
    );
    getArchivedJobs.mockResolvedValue(
      page([
        { ...COUNTED, jobID: "a", groupID: "group-1", groupName: "Drone run", costMonth: "2026-08" },
        { ...COUNTED, jobID: "b", groupID: "group-1", groupName: "Drone run", costMonth: "2026-08" },
      ]),
    );
    renderWithProviders(<ArchivedJobsList enabled />);

    fireEvent.click((await screen.findAllByRole("button", { name: "Months" }))[0]);
    expect(await screen.findByText(/these 2 jobs/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(fileArchivedJobMonths).toHaveBeenCalledWith(
        "group",
        "group-1",
        expect.objectContaining({ costMonth: "2026-08" }),
      ),
    );
  });

  it("asks for nothing while it is disabled", async () => {
    renderWithProviders(<ArchivedJobsList enabled={false} />);

    expect(getArchivedJobs).not.toHaveBeenCalled();
  });
});
