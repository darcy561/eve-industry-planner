import { beforeEach, describe, expect, it, vi } from "vitest";

const planner = {
  activeGroup: { groupID: "group-1", groupName: "Q1 Exhumers" },
  jobArray: [],
  isLoggedIn: false,
  linkedEsiPatch: null,
};

vi.mock("../../Zustand/usersStore.js", () => {
  const state = () => ({
    account: {
      isLoggedIn: planner.isLoggedIn,
      actions: {
        addLinkedEsiData: (patch) => {
          planner.linkedEsiPatch = patch;
        },
      },
    },
    jobData: {
      jobArray: planner.jobArray,
      actions: {
        getActiveGroupObject: () => planner.activeGroup,
        clearActiveGroupID: () => {},
        removeGroupFromGroupArray: () => {},
        removeJobsFromJobArray: () => {},
      },
    },
  });
  return { default: { getState: state } };
});

vi.mock("../Debounce/jobGroupsPersistSchedule.js", () => ({
  flushPendingGroupSave: async () => {},
}));

vi.mock("../../Events/snackbarEvents.js", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

const { archiveGroupJobs } = await import("./archiveGroupJobs.js");

/** A job holding one linked run, one order and one sale. */
const jobWithLinkedRows = (jobID) => ({
  jobID,
  esi: {
    industryJobs: { 500001: { job_id: 500001 } },
    marketOrders: { 700001: { order_id: 700001 } },
    transactions: { 800001: { transaction_id: 800001 } },
  },
});

beforeEach(() => {
  planner.activeGroup = { groupID: "group-1", groupName: "Q1 Exhumers" };
  planner.jobArray = [];
  planner.isLoggedIn = false;
  planner.linkedEsiPatch = null;
});

describe("archiving a group's jobs", () => {
  // Every kind of linked row is released together. A run or a sale left marked
  // as spoken for is filtered out of every job's list of what it could link,
  // and nothing ever takes it back off again.
  it("releases the runs, the orders and the sales the jobs held", async () => {
    await archiveGroupJobs([jobWithLinkedRows("job-1")]);

    expect([...planner.linkedEsiPatch.jobsToRemove]).toEqual([500001]);
    expect([...planner.linkedEsiPatch.ordersToRemove]).toEqual([700001]);
    expect([...planner.linkedEsiPatch.transactionsToRemove]).toEqual([800001]);
  });

  // A job still on the planner was kept back rather than archived, so what it
  // holds stays claimed.
  it("releases nothing for a job the reader kept on the planner", async () => {
    const kept = jobWithLinkedRows("job-1");
    planner.jobArray = [{ jobID: "job-1", displayOnPlanner: true }];

    await archiveGroupJobs([kept]);

    expect(planner.linkedEsiPatch.jobsToRemove.size).toBe(0);
    expect(planner.linkedEsiPatch.transactionsToRemove.size).toBe(0);
  });

  it("says so when there is no group open", async () => {
    planner.activeGroup = null;

    expect(await archiveGroupJobs([jobWithLinkedRows("job-1")])).toBe(false);
    expect(planner.linkedEsiPatch).toBeNull();
  });
});
