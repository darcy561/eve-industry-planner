import { beforeEach, describe, expect, it, vi } from "vitest";
import { standUpStore, storeHolder } from "../../tests/rawStoreHarness.js";

const putJobDocumentsBatch = vi.fn().mockResolvedValue(undefined);
const deleteJobDocumentsFromApi = vi.fn().mockResolvedValue(undefined);

vi.mock("../Endpoints/Private/jobDocuments.js", async (importOriginal) => ({
  ...(await importOriginal()),
  putJobDocumentsBatch: (...args) => putJobDocumentsBatch(...args),
  deleteJobDocumentsFromApi: (...args) => deleteJobDocumentsFromApi(...args),
}));

const putJobGroupsBatch = vi.fn().mockResolvedValue(undefined);

vi.mock("../Endpoints/Private/groups.js", () => ({
  putJobGroupsBatch: (...args) => putJobGroupsBatch(...args),
}));

vi.mock("../Endpoints/Private/userDocument", () => ({
  saveUserAccountDocument: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../Zustand/usersStore", async () => {
  const { rawStoreMock } = await import("../../tests/rawStoreHarness.js");
  return rawStoreMock();
});

const { default: deleteMultipleJobs } = await import("./deleteMultipleJobs.js");
const { default: Job } = await import("../../Classes/job.js");
const { default: Group } = await import("../../Classes/group.js");

const TRITANIUM = 34;

function linkedPair() {
  const child = new Job({
    jobID: "child",
    name: "Tritanium",
    itemID: TRITANIUM,
    parentJobs: ["parent"],
  });
  const parent = new Job({
    jobID: "parent",
    name: "Rifter",
    itemID: 587,
    build: {
      materials: { [TRITANIUM]: { typeID: TRITANIUM, name: "Tritanium" } },
      childJobs: { [TRITANIUM]: ["child"] },
    },
  });
  return { child, parent };
}

const actions = {
  updateModifiedGroups: vi.fn(),
  removeFromMultiSelect: vi.fn(),
  removeJobsFromJobArray: vi.fn(),
  updateOrAddJobsToJobArray: vi.fn(),
  findJobInJobArray: vi.fn(),
};

function standUpPlanner() {
  standUpStore(() => ({
    account: {
      isLoggedIn: true,
      linkedOrders: new Set(),
      linkedJobs: new Set(),
      linkedTrans: new Set(),
      actions: { addLinkedEsiData: vi.fn() },
    },
    jobData: {
      jobArray: [],
      groupArray: [],
      actions: {
        ...actions,
        findJobInJobArray: (jobID) =>
          storeHolder.current
            .getState()
            .jobData.jobArray.find((job) => job.jobID === jobID) ?? null,
      },
    },
  }));
}

function seedStore(jobs, groups = []) {
  storeHolder.current.setState((state) => ({
    jobData: { ...state.jobData, jobArray: jobs, groupArray: groups },
  }));
}

function sentWrites() {
  expect(putJobDocumentsBatch).toHaveBeenCalledOnce();
  return putJobDocumentsBatch.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  standUpPlanner();
  putJobDocumentsBatch.mockResolvedValue(undefined);
  deleteJobDocumentsFromApi.mockResolvedValue(undefined);
});

describe("deleting a job that something else was built from", () => {
  it("cuts the deleted job out of the parent that used it", async () => {
    const { child, parent } = linkedPair();
    seedStore([parent, child]);

    await deleteMultipleJobs(["child"]);

    const [written] = sentWrites();
    expect(written.jobID).toBe("parent");
    expect(written.document.build.childJobs[TRITANIUM]).toEqual([]);
  });

  it("writes the jobs it leaves behind as whole-document envelopes", async () => {
    const { child, parent } = linkedPair();
    seedStore([parent, child]);

    await deleteMultipleJobs(["child"]);

    const [written] = sentWrites();
    expect(written).toEqual({
      jobID: "parent",
      includedInGroup: false,
      groupID: "",
      document: expect.objectContaining({ jobID: "parent" }),
    });
    expect(written).not.toHaveProperty("revision");
  });

  it("deletes the job after the jobs it touched are saved", async () => {
    const { child, parent } = linkedPair();
    seedStore([parent, child]);

    await deleteMultipleJobs(["child"]);

    expect(deleteJobDocumentsFromApi).toHaveBeenCalledWith(["child"]);
    expect(actions.removeJobsFromJobArray).toHaveBeenCalledWith(["child"]);
  });
});

describe("a delete the server refused", () => {
  it("removes nothing from the planner", async () => {
    const { child, parent } = linkedPair();
    seedStore([parent, child]);
    putJobDocumentsBatch.mockRejectedValueOnce(new Error("refused"));

    await expect(deleteMultipleJobs(["child"])).rejects.toThrow("refused");

    expect(deleteJobDocumentsFromApi).not.toHaveBeenCalled();
    expect(actions.removeJobsFromJobArray).not.toHaveBeenCalled();
  });
});

describe("deleting a job that is not held", () => {
  it("writes nothing", async () => {
    seedStore([]);

    await deleteMultipleJobs(["gone"]);

    expect(putJobDocumentsBatch).not.toHaveBeenCalled();
    expect(deleteJobDocumentsFromApi).not.toHaveBeenCalled();
  });
});

describe("deleting a job that belongs to a group", () => {
  function groupedJob() {
    const job = new Job({
      jobID: "grouped",
      itemID: 587,
      groupID: "group-1",
      includedInGroup: true,
    });
    const group = new Group({
      groupID: "group-1",
      groupName: "A group",
      includedJobIDs: ["grouped", "kept"],
    });
    const kept = new Job({ jobID: "kept", itemID: 588, groupID: "group-1" });
    return { job, kept, group };
  }

  it("saves the group without the job it deleted", async () => {
    const { job, kept, group } = groupedJob();
    seedStore([job, kept], [group]);

    await deleteMultipleJobs(["grouped"]);

    expect(putJobGroupsBatch).toHaveBeenCalledOnce();
    const [written] = putJobGroupsBatch.mock.calls[0][0];
    expect(written.includedJobIDs).not.toContain("grouped");
    expect(written.includedJobIDs).toContain("kept");
  });

  it("puts the changed group into the planner", async () => {
    const { job, kept, group } = groupedJob();
    seedStore([job, kept], [group]);

    await deleteMultipleJobs(["grouped"]);

    expect(actions.updateModifiedGroups).toHaveBeenCalledOnce();
  });

  it("removes nothing when the group write is refused", async () => {
    const { job, kept, group } = groupedJob();
    seedStore([job, kept], [group]);
    putJobGroupsBatch.mockRejectedValueOnce(new Error("refused"));

    await expect(deleteMultipleJobs(["grouped"])).rejects.toThrow("refused");

    expect(actions.removeJobsFromJobArray).not.toHaveBeenCalled();
    expect(actions.updateModifiedGroups).not.toHaveBeenCalled();
  });
});
