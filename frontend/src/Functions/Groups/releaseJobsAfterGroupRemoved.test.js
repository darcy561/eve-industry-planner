import { beforeEach, describe, expect, it, vi } from "vitest";
import { activePlannerStoreState } from "../../tests/utils.js";

const storeState = activePlannerStoreState();

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});

const saveJobsViaApi = vi.fn();
vi.mock("../JobDocuments/saveJobsViaApi.js", () => ({
  saveJobsViaApi: (...args) => saveJobsViaApi(...args),
}));

const requestJobDocumentsByIdsFromApi = vi.fn();
vi.mock("../Endpoints/Private/requestJobDocumentsByIds.js", () => ({
  requestJobDocumentsByIdsFromApi: (...args) =>
    requestJobDocumentsByIdsFromApi(...args),
}));

const { applyGroupRemovalToJobs, releaseJobsAfterGroupRemoved } =
  await import("./releaseJobsAfterGroupRemoved.js");

/**
 * A job as the store holds one, releasing itself the way {@link Job} does — the
 * same fields and the same empty-string group id, so a test asserting on either
 * is asserting on a shape the real class produces.
 */
function job(jobID, groupID) {
  return {
    jobID,
    groupID,
    includedInGroup: Boolean(groupID),
    displayOnPlanner: !groupID,
    releaseFromGroupToPlanner() {
      this.includedInGroup = false;
      this.groupID = "";
      this.displayOnPlanner = true;
    },
  };
}

const updateOrAddJobsToJobArray = vi.fn();

beforeEach(() => {
  saveJobsViaApi.mockClear();
  requestJobDocumentsByIdsFromApi.mockClear();
  requestJobDocumentsByIdsFromApi.mockResolvedValue([]);
  updateOrAddJobsToJobArray.mockClear();
  storeState.account.isLoggedIn = true;
  storeState.jobData.jobArray = [job("job-1", "group-1"), job("job-2", null)];
  storeState.jobData.actions.findJobInJobArray = (jobID) =>
    storeState.jobData.jobArray.find((entry) => entry.jobID === jobID) ?? null;
  storeState.jobData.actions.updateOrAddJobsToJobArray =
    updateOrAddJobsToJobArray;
});

describe("a group removed by somebody else", () => {
  it("releases the jobs this client holds", () => {
    const released = applyGroupRemovalToJobs({ groupID: "group-1" });

    expect(released.map((entry) => entry.jobID)).toEqual(["job-1"]);
    expect(storeState.jobData.jobArray[0].groupID).toBe("");
    expect(storeState.jobData.jobArray[0].displayOnPlanner).toBe(true);
    expect(updateOrAddJobsToJobArray).toHaveBeenCalledWith(released);
  });

  // The client that deleted the group saved these jobs, and its writes arrive
  // here as job deliveries. A second client saving its own copies would race the
  // author of the change once per connected member.
  it("writes nothing", () => {
    applyGroupRemovalToJobs({
      groupID: "group-1",
      includedJobIDs: ["job-1", "job-never-opened"],
    });

    expect(saveJobsViaApi).not.toHaveBeenCalled();
    expect(requestJobDocumentsByIdsFromApi).not.toHaveBeenCalled();
  });

  it("leaves a job of another group alone", () => {
    applyGroupRemovalToJobs({ groupID: "group-other" });

    expect(storeState.jobData.jobArray[0].groupID).toBe("group-1");
    expect(updateOrAddJobsToJobArray).not.toHaveBeenCalled();
  });
});

describe("the client removing the group", () => {
  it("loads the group's jobs it does not hold, and saves what it released", async () => {
    await releaseJobsAfterGroupRemoved({
      groupID: "group-1",
      includedJobIDs: ["job-1", "job-never-opened"],
    });

    expect(requestJobDocumentsByIdsFromApi).toHaveBeenCalledWith([
      "job-never-opened",
    ]);
    expect(saveJobsViaApi).toHaveBeenCalledTimes(1);
    expect(saveJobsViaApi.mock.calls[0][0].map((entry) => entry.jobID)).toEqual(
      ["job-1"],
    );
  });

  it("writes nothing when signed out", async () => {
    storeState.account.isLoggedIn = false;

    await releaseJobsAfterGroupRemoved({ groupID: "group-1" });

    expect(requestJobDocumentsByIdsFromApi).not.toHaveBeenCalled();
    expect(saveJobsViaApi).not.toHaveBeenCalled();
  });
});
