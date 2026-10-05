import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { archived, navigated, removed, cleared, released, requeued, outcome } =
  vi.hoisted(() => ({
    archived: { jobs: null },
    navigated: [],
    removed: [],
    cleared: [],
    released: [],
    requeued: [],
    outcome: { current: "saved" },
  }));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    jobData: {
      pendingJobDocumentWrites: { "job-1": null },
      actions: {
        removeJobsFromJobArray: (id) => removed.push(id),
        takeQueuedJobDocumentWrites: (ids) => {
          cleared.push(...ids);
          return { [ids[0]]: null };
        },
        findJobInJobArray: (jobID) => ({ jobID }),
        queueJobDocumentWritesFromJobs: (jobs) => requeued.push(...jobs),
      },
    },
    account: {
      isLoggedIn: true,
      actions: { addLinkedEsiData: (patch) => released.push(patch) },
    },
  });
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => (to) => navigated.push(to),
  useParams: () => ({ jobID: "job-1" }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  QueryClient: class {},
}));

vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => false,
}));

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock(
  "../../../../../../Functions/Endpoints/Private/archivedJobs.js",
  () => ({
    default: async (jobs) => {
      archived.jobs = jobs;
      return outcome.current;
    },
  }),
);

vi.mock(
  "../../../../../../Functions/Groups/markJobsArchivedInGroups.js",
  () => ({ markJobsArchivedInGroups: async () => {} }),
);

vi.mock("../../../../../../Functions/Endpoints/Private/userDocument", () => ({
  saveUserAccountDocument: async () => true,
}));

vi.mock("../../../../../../Hooks/React Query/Backend/archivedJobsList", () => ({
  invalidateArchiveQueries: () => {},
}));

vi.mock(
  "../../../../../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js",
  () => ({ yieldEditJobDocumentLocksOnLeave: async () => {} }),
);

const { ArchiveJobButton } = await import("./archiveJobButton.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { snackbarSpies } =
  await import("../../../../../../tests/snackbarHarness.js");

const session = () => useUsersStore.getState().editSession;

const openJob = () =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    name: "Rifter",
    build: {},
    esi: {
      industryJobs: { 1: { job_id: 1 } },
      marketOrders: {},
      transactions: {},
    },
  });

const archive = () =>
  userEvent.click(screen.getByRole("button", { name: "Archive Job" }));

beforeEach(() => {
  vi.clearAllMocks();
  archived.jobs = null;
  navigated.length = 0;
  removed.length = 0;
  cleared.length = 0;
  released.length = 0;
  requeued.length = 0;
  outcome.current = "saved";
  session().actions.closeSession();
  openJob();
});

describe("archiving a finished job", () => {
  it("writes the job away and leaves the planner", async () => {
    render(<ArchiveJobButton />);

    await archive();

    expect(archived.jobs).toHaveLength(1);
    expect(archived.jobs[0].build).toEqual(expect.any(Object));
    expect(archived.jobs[0].jobID).toBe("job-1");
    expect(removed).toEqual(["job-1"]);
    expect(cleared).toEqual(["job-1"]);
    expect(requeued).toEqual([]);
    expect([...released[0].jobsToRemove]).toEqual([1]);
    expect(navigated).toEqual([{ to: "/jobplanner" }]);
  });

  it.each(["locked", "conflict", "failed"])(
    "keeps the job and its ESI links when the archive is refused (%s)",
    async (refused) => {
      outcome.current = refused;
      render(<ArchiveJobButton />);

      await archive();

      expect(snackbarSpies.showSnackbarError).toHaveBeenCalledWith(
        expect.stringContaining("Nothing was archived"),
        5,
      );
      expect(removed).toEqual([]);
      expect(released).toEqual([]);
      expect(requeued.map((held) => held.jobID)).toEqual(["job-1"]);
      expect(navigated).toEqual([]);
    },
  );
});
