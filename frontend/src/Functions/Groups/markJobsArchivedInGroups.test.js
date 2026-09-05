import { describe, it, expect, vi, beforeEach } from "vitest";

const putJobGroupsBatch = vi.fn();
const updateModifiedGroups = vi.fn();
const getState = vi.fn();

vi.mock("../Endpoints/Private/groups.js", () => ({
  putJobGroupsBatch: (...args) => putJobGroupsBatch(...args),
}));
vi.mock("../../Zustand/usersStore.js", () => ({
  default: { getState: () => getState() },
}));

const { markJobsArchivedInGroups } = await import("./markJobsArchivedInGroups.js");
const { default: Group } = await import("../../Classes/group.js");

function job(jobID, groupID, itemID = 587, parents = []) {
  return {
    jobID,
    groupID,
    itemID,
    name: jobID,
    parentJobs: parents,
    esiJobIDs: new Set(),
    esiOrderIDs: new Set(),
    esiTransactionIDs: new Set(),
    build: { materials: [] },
  };
}

function storeWith(groups, jobs, isLoggedIn = true) {
  return {
    jobData: {
      groupArray: groups,
      jobArray: jobs,
      actions: { updateModifiedGroups },
    },
    account: { isLoggedIn },
  };
}

beforeEach(() => {
  putJobGroupsBatch.mockReset();
  updateModifiedGroups.mockReset();
  getState.mockReset();
});

describe("markJobsArchivedInGroups", () => {
  it("marks the job archived while leaving it a member", async () => {
    const jobs = [job("job-a", "group-1"), job("job-b", "group-1", 34, ["job-a"])];
    const group = new Group({ groupID: "group-1" });
    group.createGroup(jobs);
    getState.mockReturnValue(storeWith([group], jobs));

    const [changed] = await markJobsArchivedInGroups([jobs[1]]);

    expect([...changed.includedJobIDs].sort()).toEqual(["job-a", "job-b"]);
    expect([...changed.archivedJobIDs]).toEqual(["job-b"]);
    // The derived sets describe the jobs still on the planner.
    expect([...changed.includedTypeIDs]).toEqual([587]);
    expect(putJobGroupsBatch).toHaveBeenCalledTimes(1);
    expect(updateModifiedGroups).toHaveBeenCalledWith([changed]);
  });

  // A job with no group has nothing to record against.
  it("does nothing for an ungrouped job", async () => {
    getState.mockReturnValue(storeWith([], []));

    expect(await markJobsArchivedInGroups([job("job-a", "")])).toEqual([]);
    expect(putJobGroupsBatch).not.toHaveBeenCalled();
  });

  // The group may already have been deleted, which is the whole-group archive.
  it("does nothing when the group is not held", async () => {
    const jobs = [job("job-a", "group-gone")];
    getState.mockReturnValue(storeWith([], jobs));

    expect(await markJobsArchivedInGroups(jobs)).toEqual([]);
    expect(putJobGroupsBatch).not.toHaveBeenCalled();
  });

  // Logged out there is no server to write to, but the local group still needs
  // to know its member is archived.
  it("updates the store without a server write when logged out", async () => {
    const jobs = [job("job-a", "group-1"), job("job-b", "group-1", 34, ["job-a"])];
    const group = new Group({ groupID: "group-1" });
    group.createGroup(jobs);
    getState.mockReturnValue(storeWith([group], jobs, false));

    await markJobsArchivedInGroups([jobs[1]]);

    expect(putJobGroupsBatch).not.toHaveBeenCalled();
    expect(updateModifiedGroups).toHaveBeenCalledTimes(1);
  });
});
