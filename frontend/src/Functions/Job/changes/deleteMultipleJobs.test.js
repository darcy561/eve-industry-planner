import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeHolder } from "../../../tests/rawStoreHarness.js";
import {
  heldElsewhere,
  plannerHolds,
  plannerJobIDs,
  readFromServer,
  serverHolds,
  standUpJobPlanner,
} from "../../../tests/jobPlannerHarness.js";

const saveJobsAsOneChange = vi.fn();
const restoreSavedJobs = vi.fn();
const requestJobDocumentsByIdsFromApi = vi.fn();
const saveUserAccountDocument = vi.fn();

vi.mock("../sync/saveJobsViaApi.js", () => ({
  saveJobsAsOneChange: (...args) => saveJobsAsOneChange(...args),
}));

vi.mock("../sync/persistJobDocumentsToApi.js", () => ({
  restoreSavedJobs: (...args) => restoreSavedJobs(...args),
}));

vi.mock("../../Endpoints/Private/requestJobDocumentsByIds.js", () => ({
  requestJobDocumentsByIdsFromApi: (...args) =>
    requestJobDocumentsByIdsFromApi(...args),
}));

vi.mock("../../Debounce/jobDocumentsPersistSchedule.js", () => ({
  flushPendingJobDocumentsSave: vi.fn().mockResolvedValue("saved"),
}));

vi.mock("../../Endpoints/Private/userDocument", () => ({
  saveUserAccountDocument: (...args) => saveUserAccountDocument(...args),
}));

vi.mock("../../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../../Zustand/usersStore", async () => {
  const { rawStoreMock } = await import("../../../tests/rawStoreHarness.js");
  return rawStoreMock();
});

const { default: deleteMultipleJobs } = await import("./deleteMultipleJobs.js");
const { jobFromDocument } = await import("../jobDocument.js");
const { default: Group } = await import("../../../Classes/group.js");
const { showSnackbarWarning } = await import("../../../Events/snackbarEvents");

const TRITANIUM = 34;

function job(document) {
  return jobFromDocument({ _meta: { revision: 4 }, ...document });
}

function linkedPair() {
  const child = job({
    jobID: "child",
    name: "Tritanium",
    itemID: TRITANIUM,
    parentJobs: ["parent"],
  });
  const parent = job({
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

function sentChange() {
  expect(saveJobsAsOneChange).toHaveBeenCalledOnce();
  const [jobs, , removed] = saveJobsAsOneChange.mock.calls[0];
  return { jobs, removed };
}

beforeEach(() => {
  vi.clearAllMocks();
  standUpJobPlanner();
  serverHolds([]);
  saveJobsAsOneChange.mockResolvedValue("saved");
  restoreSavedJobs.mockResolvedValue(undefined);
  saveUserAccountDocument.mockResolvedValue(true);
  requestJobDocumentsByIdsFromApi.mockImplementation(readFromServer);
});

describe("deleting a job that something else was built from", () => {
  it("unlinks the parent and removes the job at the revision read, as one change", async () => {
    const { child, parent } = linkedPair();
    serverHolds([child, parent]);

    const deleted = await deleteMultipleJobs(["child"]);

    expect(deleted).toBe(true);
    const { jobs, removed } = sentChange();
    expect(jobs.map((held) => held.jobID)).toEqual(["parent"]);
    expect(jobs[0].build.childJobs[TRITANIUM]).toEqual([]);
    expect(removed.map((held) => [held.jobID, held._meta.revision])).toEqual([
      ["child", 4],
    ]);
    expect(plannerJobIDs()).toEqual(["parent"]);
  });

  it("unlinks a parent the planner had not loaded", async () => {
    const { child, parent } = linkedPair();
    serverHolds([child, parent]);
    plannerHolds([child]);

    await deleteMultipleJobs(["child"]);

    expect(sentChange().jobs.map((held) => held.jobID)).toEqual(["parent"]);
  });
});

describe("a delete that touches a job open elsewhere", () => {
  it("sends nothing and names the job", async () => {
    const { child, parent } = linkedPair();
    serverHolds([child, parent]);
    heldElsewhere("parent");

    const deleted = await deleteMultipleJobs(["child"]);

    expect(deleted).toBe(false);
    expect(saveJobsAsOneChange).not.toHaveBeenCalled();
    expect(showSnackbarWarning).toHaveBeenCalledWith(
      "Nothing was deleted. Rifter: open for editing elsewhere.",
      8,
    );
  });
});

describe("a delete the server refused", () => {
  it.each(["conflict", "locked"])(
    "puts back what it read and says what moved (%s)",
    async (outcome) => {
      const { child, parent } = linkedPair();
      serverHolds([child, parent]);
      saveJobsAsOneChange.mockResolvedValueOnce(outcome);
      restoreSavedJobs.mockImplementationOnce(async () => {
        storeHolder.current
          .getState()
          .jobData.actions.removeJobsFromJobArray(["parent"]);
      });

      const deleted = await deleteMultipleJobs(["child"]);

      expect(deleted).toBe(false);
      expect(restoreSavedJobs.mock.calls[0][0].sort()).toEqual([
        "child",
        "parent",
      ]);
      expect(showSnackbarWarning).toHaveBeenCalledWith(
        "Nothing was deleted. Rifter: removed.",
        8,
      );
      expect(plannerJobIDs()).toEqual(["child"]);
    },
  );

  it("writes no group and keeps the account's ESI links", async () => {
    const {
      addLinkedEsiData,
      actions: { updateModifiedGroups },
    } = standUpJobPlanner();
    serverHolds([
      job({
        jobID: "grouped",
        itemID: 587,
        groupID: "group-1",
        esi: {
          industryJobs: { 500: { job_id: 500 } },
          marketOrders: {},
          transactions: {},
        },
      }),
    ]);
    plannerHolds(
      [],
      [new Group({ groupID: "group-1", includedJobIDs: ["grouped"] })],
    );
    saveJobsAsOneChange.mockResolvedValueOnce("failed");

    await deleteMultipleJobs(["grouped"]);

    expect(updateModifiedGroups).not.toHaveBeenCalled();
    expect(addLinkedEsiData).not.toHaveBeenCalled();
    expect(saveUserAccountDocument).not.toHaveBeenCalled();
  });
});

describe("what follows a delete once it lands", () => {
  function groupedWithLinks() {
    return job({
      jobID: "grouped",
      itemID: 587,
      groupID: "group-1",
      esi: {
        industryJobs: { 500: { job_id: 500 } },
        marketOrders: {},
        transactions: {},
      },
    });
  }

  it("puts the group without the job into the planner and queues it", async () => {
    const {
      actions: { updateModifiedGroups },
    } = standUpJobPlanner();
    const kept = job({ jobID: "kept", itemID: 588, groupID: "group-1" });
    serverHolds([groupedWithLinks()]);
    plannerHolds(
      [kept],
      [new Group({ groupID: "group-1", includedJobIDs: ["grouped", "kept"] })],
    );

    await deleteMultipleJobs(["grouped"]);

    const [[written]] = updateModifiedGroups.mock.calls[0];
    expect([...written.includedJobIDs]).toEqual(["kept"]);
  });

  it("releases the job's ESI links and saves the account", async () => {
    const { addLinkedEsiData } = standUpJobPlanner();
    serverHolds([groupedWithLinks()]);

    await deleteMultipleJobs(["grouped"]);

    expect([...addLinkedEsiData.mock.calls[0][0].jobsToRemove]).toEqual([500]);
    expect(saveUserAccountDocument).toHaveBeenCalledOnce();
  });

  it("warns when the account could not be saved", async () => {
    serverHolds([groupedWithLinks()]);
    saveUserAccountDocument.mockResolvedValueOnce(false);

    await deleteMultipleJobs(["grouped"]);

    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("could not be released"),
      8,
    );
  });
});

describe("deleting a job that is already gone", () => {
  it("sends nothing and answers that it is gone", async () => {
    const deleted = await deleteMultipleJobs(["missing"]);

    expect(deleted).toBe(true);
    expect(saveJobsAsOneChange).not.toHaveBeenCalled();
  });
});

describe("deleting while signed out", () => {
  it("removes the planner's own job without reading or sending anything", async () => {
    standUpJobPlanner({ isLoggedIn: false });
    const { child, parent } = linkedPair();
    plannerHolds([child, parent]);

    await deleteMultipleJobs(["child"]);

    expect(requestJobDocumentsByIdsFromApi).not.toHaveBeenCalled();
    expect(saveJobsAsOneChange).not.toHaveBeenCalled();
    expect(plannerJobIDs()).toEqual(["parent"]);
  });
});
