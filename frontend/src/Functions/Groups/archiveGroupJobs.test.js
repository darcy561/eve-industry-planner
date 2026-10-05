import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  heldElsewhere,
  plannerHolds,
  plannerJobIDs,
  standUpJobPlanner,
} from "../../tests/jobPlannerHarness.js";

const saveArchivedJobs = vi.fn();
const deleteJobGroupsFromApi = vi.fn();
const saveUserAccountDocument = vi.fn();
const clearedWrites = [];

vi.mock("../../Zustand/usersStore.js", async () => {
  const { rawStoreMock } = await import("../../tests/rawStoreHarness.js");
  return rawStoreMock();
});

vi.mock("../Endpoints/Private/archivedJobs.js", () => ({
  default: (...args) => saveArchivedJobs(...args),
}));

vi.mock("../Endpoints/Private/groups.js", () => ({
  deleteJobGroupsFromApi: (...args) => deleteJobGroupsFromApi(...args),
  USER_JOB_GROUPS_COLLECTION: "job_groups",
}));

vi.mock("../Endpoints/Private/userDocument", () => ({
  saveUserAccountDocument: (...args) => saveUserAccountDocument(...args),
}));

vi.mock("../Debounce/jobGroupsPersistSchedule.js", () => ({
  flushPendingGroupSave: async () => {},
}));

vi.mock("../Debounce/jobDocumentsPersistSchedule.js", () => ({
  flushPendingJobDocumentsSave: async () => "saved",
}));

vi.mock("../../Events/snackbarEvents.js", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

const { archiveGroupJobs } = await import("./archiveGroupJobs.js");
const { showSnackbarError, showSnackbarWarning } =
  await import("../../Events/snackbarEvents.js");

const jobWithLinkedRows = (jobID, revision = 3) => ({
  jobID,
  _meta: { revision },
  esi: {
    industryJobs: { 500001: { job_id: 500001 } },
    marketOrders: { 700001: { order_id: 700001 } },
    transactions: { 800001: { transaction_id: 800001 } },
  },
});

let addLinkedEsiData;
let activeGroup;

function onPlanner(jobs, isLoggedIn = true) {
  ({ addLinkedEsiData } = standUpJobPlanner({
    isLoggedIn,
    actions: {
      getActiveGroupObject: () => activeGroup,
      clearActiveGroupID: vi.fn(),
      removeGroupFromGroupArray: vi.fn(),
      clearPendingJobDocumentWrites: (jobIDs) => clearedWrites.push(...jobIDs),
    },
  }));
  plannerHolds(jobs);
}

function released() {
  return addLinkedEsiData.mock.calls[0]?.[0] ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearedWrites.length = 0;
  activeGroup = { groupID: "group-1", groupName: "Q1 Exhumers" };
  onPlanner([]);
  saveArchivedJobs.mockResolvedValue("saved");
  deleteJobGroupsFromApi.mockResolvedValue(undefined);
  saveUserAccountDocument.mockResolvedValue(true);
});

describe("archiving a group's jobs", () => {
  it("archives the planner's current copies, then removes the group", async () => {
    onPlanner([jobWithLinkedRows("job-1", 7)]);

    expect(await archiveGroupJobs([jobWithLinkedRows("job-1", 3)])).toBe(true);

    expect(saveArchivedJobs.mock.calls[0][0][0]._meta.revision).toBe(7);
    expect(deleteJobGroupsFromApi).toHaveBeenCalledWith(["group-1"]);
    expect(plannerJobIDs()).toEqual([]);
    expect(clearedWrites).toEqual(["job-1"]);
  });

  it("releases the runs, the orders and the sales the jobs held, and saves the account", async () => {
    await archiveGroupJobs([jobWithLinkedRows("job-1")]);

    expect([...released().jobsToRemove]).toEqual([500001]);
    expect([...released().ordersToRemove]).toEqual([700001]);
    expect([...released().transactionsToRemove]).toEqual([800001]);
    expect(saveUserAccountDocument).toHaveBeenCalledOnce();
  });

  it("leaves a job the reader kept on the planner, and what it holds", async () => {
    onPlanner([{ ...jobWithLinkedRows("job-1"), displayOnPlanner: true }]);

    await archiveGroupJobs([jobWithLinkedRows("job-1")]);

    expect(saveArchivedJobs.mock.calls[0][0]).toEqual([]);
    expect(released()).toBeNull();
  });

  it.each(["locked", "conflict", "failed"])(
    "changes nothing locally when the archive is refused (%s)",
    async (outcome) => {
      saveArchivedJobs.mockResolvedValueOnce(outcome);

      expect(await archiveGroupJobs([jobWithLinkedRows("job-1")])).toBe(false);

      expect(deleteJobGroupsFromApi).not.toHaveBeenCalled();
      expect(saveUserAccountDocument).not.toHaveBeenCalled();
      expect(released()).toBeNull();
      expect(showSnackbarWarning).toHaveBeenCalledWith(
        expect.stringContaining("Nothing was archived"),
        8,
      );
    },
  );

  it("archives nothing while another member has the group open", async () => {
    heldElsewhere("group-1", "job_groups");

    expect(await archiveGroupJobs([jobWithLinkedRows("job-1")])).toBe(false);

    expect(saveArchivedJobs).not.toHaveBeenCalled();
  });

  it("says so when the group could not be removed after the jobs moved", async () => {
    deleteJobGroupsFromApi.mockRejectedValueOnce(new Error("refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await archiveGroupJobs([jobWithLinkedRows("job-1")])).toBe(true);

    expect(plannerJobIDs()).toEqual([]);
    expect(showSnackbarError).toHaveBeenCalledWith(
      expect.stringContaining("the group could not be removed"),
      5,
    );
  });

  it("says so when there is no group open", async () => {
    activeGroup = null;

    expect(await archiveGroupJobs([jobWithLinkedRows("job-1")])).toBe(false);
    expect(saveArchivedJobs).not.toHaveBeenCalled();
  });

  it("archives locally while signed out", async () => {
    onPlanner([jobWithLinkedRows("job-1")], false);

    expect(await archiveGroupJobs([jobWithLinkedRows("job-1")])).toBe(false);

    expect(saveArchivedJobs).not.toHaveBeenCalled();
    expect(plannerJobIDs()).toEqual([]);
    expect(saveUserAccountDocument).not.toHaveBeenCalled();
  });
});
