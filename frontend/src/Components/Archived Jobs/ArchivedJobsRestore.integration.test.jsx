import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import {
  renderWithProviders,
  setViewportWide,
} from "../../../tests/archiveHarness.jsx";

/**
 * Restoring, from the click to what the tab is left holding.
 *
 * The parts either side of this are covered — the server sequence by a live test
 * and the row shapes by unit tests — while the chain between them is not: which
 * scope the button asks for, what the response does to the planner store, and
 * what the user is told when a link could not be reclaimed.
 */

const getArchivedJobs = vi.fn();
const restoreArchivedJobs = vi.fn();
const invalidateArchiveQueries = vi.fn();
const showSnackbarSuccess = vi.fn();
const showSnackbarError = vi.fn();

vi.mock("../../Functions/Endpoints/Private/archivedJobsList", async () => {
  const { emptyArchiveListMock } = await import("../../../tests/archiveHarness.jsx");
  return {
    ...emptyArchiveListMock(),
    getArchivedJobs: (...args) => getArchivedJobs(...args),
    restoreArchivedJobs: (...args) => restoreArchivedJobs(...args),
  };
});
vi.mock("../../Hooks/React Query/Backend/archivedJobsList", async () => {
  const actual = await vi.importActual("../../Hooks/React Query/Backend/archivedJobsList");
  return { ...actual, invalidateArchiveQueries: (...a) => invalidateArchiveQueries(...a) };
});
vi.mock("../../Events/snackbarEvents", () => ({
  showSnackbarSuccess: (...args) => showSnackbarSuccess(...args),
  showSnackbarError: (...args) => showSnackbarError(...args),
}));
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../../../tests/archiveHarness.jsx");
  const { archiveStoreState } = await import("../../../tests/archiveHarness.jsx");
  return usersStoreMock(archiveStoreState());
});

const { ArchivedJobsList } = await import("./ArchivedJobsList.jsx");
const useUsersStore = (await import("../../Zustand/usersStore")).default;

const JOB = {
  jobID: "job-1",
  name: "Rifter",
  archivedAt: "2026-08-21T00:00:00Z",
  measures: { jobCostTotal: 1000, profitLoss: 250, segment: "standaloneRecordedSale" },
};
const GROUPED = {
  ...JOB,
  jobID: "job-grouped",
  name: "Hobgoblin II",
  groupID: "group-1",
  groupName: "Drone run",
};

function page(jobs) {
  return { jobs, paging: { totalJobs: jobs.length } };
}

function actions() {
  return useUsersStore.getState().jobData.actions;
}

beforeEach(() => {
  vi.clearAllMocks();
  getArchivedJobs.mockResolvedValue(page([JOB]));
  restoreArchivedJobs.mockResolvedValue({ restoredJobIDs: ["job-1"], jobs: [], groups: [] });
  setViewportWide(true);
});

describe("restoring from the archive, end to end", () => {
  it("asks for the job scope and refreshes both views", async () => {
    renderWithProviders(<ArchivedJobsList enabled />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => expect(restoreArchivedJobs).toHaveBeenCalledWith("job", "job-1"));
    // The list and the statistics both move, and one function knows which.
    await waitFor(() => expect(invalidateArchiveQueries).toHaveBeenCalled());
    expect(showSnackbarSuccess).toHaveBeenCalledWith("1 job restored");
  });

  it("asks for the group scope when the block is restored", async () => {
    getArchivedJobs.mockResolvedValue(page([GROUPED]));
    renderWithProviders(<ArchivedJobsList enabled />);

    fireEvent.click(await screen.findByRole("button", { name: "Restore group" }));

    await waitFor(() =>
      expect(restoreArchivedJobs).toHaveBeenCalledWith("group", "group-1"),
    );
  });

  // The websocket excludes the tab that made the change, so this is the one
  // client that has to apply the response itself.
  it("puts the restored jobs and their group into the planner store", async () => {
    restoreArchivedJobs.mockResolvedValue({
      restoredJobIDs: ["job-1"],
      jobs: [{ jobID: "job-1", name: "Rifter", itemID: 587 }],
      groups: [{ groupID: "group-1", groupName: "Drone run", includedJobIDs: ["job-1"] }],
    });
    renderWithProviders(<ArchivedJobsList enabled />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => expect(actions().updateOrAddJobsToJobArray).toHaveBeenCalled());
    // Not held here, so it is added rather than merged into a group this tab
    // does not have.
    expect(actions().addGroupToGroupArray).toHaveBeenCalled();
    expect(actions().updateModifiedGroups).not.toHaveBeenCalled();
  });

  it("merges into a group this tab already holds", async () => {
    useUsersStore.getState().jobData.groupArray.push({ groupID: "group-1" });
    restoreArchivedJobs.mockResolvedValue({
      restoredJobIDs: ["job-1"],
      jobs: [],
      groups: [{ groupID: "group-1", groupName: "Drone run", includedJobIDs: ["job-1"] }],
    });
    renderWithProviders(<ArchivedJobsList enabled />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => expect(actions().updateModifiedGroups).toHaveBeenCalled());
    expect(actions().addGroupToGroupArray).not.toHaveBeenCalled();
    useUsersStore.getState().jobData.groupArray.length = 0;
  });

  // A link another job reclaimed is reported rather than failing the restore:
  // the job came back, and the user is told what did not come with it.
  it("tells the user which ESI links could not be reclaimed", async () => {
    restoreArchivedJobs.mockResolvedValue({
      restoredJobIDs: ["job-1"],
      jobs: [],
      groups: [],
      conflicts: [{ kind: "job", id: 4242 }],
    });
    renderWithProviders(<ArchivedJobsList enabled />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(showSnackbarSuccess).toHaveBeenCalledWith(
        "1 job restored. 1 ESI link could not be reclaimed",
      ),
    );
  });

  // The rows stay disabled for as long as the write and the refresh it triggers
  // are in flight — not just until the request resolves, which is when a flag
  // cleared and left the list showing the page the job had already left.
  it("holds the rows until the restore and its refresh are done", async () => {
    let finish;
    restoreArchivedJobs.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderWithProviders(<ArchivedJobsList enabled />);
    const restore = await screen.findByRole("button", { name: "Restore" });

    fireEvent.click(restore);
    await waitFor(() => expect(restore).toBeDisabled());

    finish({ restoredJobIDs: ["job-1"], jobs: [], groups: [] });
    await waitFor(() => expect(invalidateArchiveQueries).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled(),
    );
  });

  it("reports a failed restore and leaves the caches alone", async () => {
    restoreArchivedJobs.mockResolvedValue(null);
    renderWithProviders(<ArchivedJobsList enabled />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => expect(showSnackbarError).toHaveBeenCalled());
    // Nothing moved, so invalidating would refetch two views for no reason.
    expect(invalidateArchiveQueries).not.toHaveBeenCalled();
    expect(actions().updateOrAddJobsToJobArray).not.toHaveBeenCalled();
  });
});
