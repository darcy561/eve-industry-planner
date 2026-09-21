import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { archived, navigated, removed, saveOk } = vi.hoisted(() => ({
  archived: { jobs: null },
  navigated: [],
  removed: [],
  saveOk: { current: true },
}));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    jobData: {
      actions: { removeJobsFromJobArray: (id) => removed.push(id) },
    },
    account: {
      isLoggedIn: true,
      actions: { addLinkedEsiData: () => {} },
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

vi.mock("../../../../../../Functions/Endpoints/Private/archivedJobs", () => ({
  default: async (jobs) => {
    archived.jobs = jobs;
    return saveOk.current;
  },
}));

vi.mock(
  "../../../../../../Functions/Groups/markJobsArchivedInGroups.js",
  () => ({ markJobsArchivedInGroups: async () => {} }),
);

vi.mock(
  "../../../../../../Functions/Endpoints/Private/jobDocuments.js",
  () => ({ deleteJobDocumentsFromApi: async () => {} }),
);

vi.mock(
  "../../../../../../Functions/Debounce/jobDocumentsPersistSchedule.js",
  () => ({ flushPendingJobDocumentsSave: async () => {} }),
);

vi.mock("../../../../../../Functions/Endpoints/Private/userDocument", () => ({
  saveUserAccountDocument: async () => {},
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
  saveOk.current = true;
  session().actions.closeSession();
  openJob();
});

describe("archiving a finished job", () => {
  // The archive is written from the job as a class, because that is what says
  // what its document is and which ESI rows it holds.
  it("writes the job away and leaves the planner", async () => {
    render(<ArchiveJobButton />);

    await archive();

    expect(archived.jobs).toHaveLength(1);
    expect(typeof archived.jobs[0].toDocument).toBe("function");
    expect(archived.jobs[0].jobID).toBe("job-1");
    expect(removed).toEqual(["job-1"]);
    expect(navigated).toEqual([{ to: "/jobplanner" }]);
  });

  // The job stays where it is when the server would not take it: removing it
  // from the planner first would lose it.
  it("keeps the job when the archive is refused", async () => {
    saveOk.current = false;
    render(<ArchiveJobButton />);

    await archive();

    expect(snackbarSpies.showSnackbarError).toHaveBeenCalled();
    expect(removed).toEqual([]);
    expect(navigated).toEqual([]);
  });
});
