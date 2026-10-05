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
const confirmMergeDiscards = vi.fn();
const showMergeRefused = vi.fn();
const saveUserAccountDocument = vi.fn();

vi.mock("../sync/saveJobsViaApi.js", () => ({
  saveJobsAsOneChange: (...args) => saveJobsAsOneChange(...args),
}));

vi.mock("../sync/persistJobDocumentsToApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
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

vi.mock("../../../Events/mergeJobsEvents", () => ({
  confirmMergeDiscards: (...args) => confirmMergeDiscards(...args),
  showMergeRefused: (...args) => showMergeRefused(...args),
}));

vi.mock("../../Shared/normaliseParentChildRelationships.js", () => ({
  default: () => [],
}));

vi.mock("../../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../../Zustand/usersStore", async () => {
  const { rawStoreMock } = await import("../../../tests/rawStoreHarness.js");
  return rawStoreMock();
});

const { default: mergeJobs, recordsAMergeDiscards } =
  await import("./mergeJobs.js");
const { jobFromDocument } = await import("../jobDocument.js");

const RIFTER = 587;
const RIFTER_PARENT = 11567;

function job(document) {
  return jobFromDocument({ _meta: { revision: 4 }, ...document });
}

function duplicates(extra = {}) {
  return [
    job({ jobID: "old-1", name: "Rifter", itemID: RIFTER, ...extra }),
    job({ jobID: "old-2", name: "Rifter", itemID: RIFTER }),
  ];
}

function linkedAround() {
  const merged = duplicates();
  for (const held of merged) {
    held.parentJobs = ["parent"];
    held.build.materials = { 34: { typeID: 34, name: "Tritanium" } };
    held.build.childJobs = { 34: ["child"] };
  }
  const parent = job({
    jobID: "parent",
    name: "Wolf",
    itemID: RIFTER_PARENT,
    build: {
      materials: { [RIFTER]: { typeID: RIFTER, name: "Rifter" } },
      childJobs: { [RIFTER]: ["old-1", "old-2"] },
    },
  });
  const child = job({
    jobID: "child",
    itemID: 34,
    parentJobs: ["old-1", "old-2"],
  });
  return [...merged, parent, child];
}

function buildsOne() {
  return vi.fn(async ({ itemID, parentJobs, childJobs }) => {
    const built = jobFromDocument({ jobID: "merged", itemID, parentJobs });
    for (const { typeID, childJobs: ids } of childJobs) {
      built.build.materials[typeID] = { typeID, name: String(typeID) };
      built.build.childJobs[typeID] = ids;
    }
    return built;
  });
}

function sentChange() {
  const [jobs, , removed] = saveJobsAsOneChange.mock.calls[0];
  return { jobs, removed };
}

function written(jobID) {
  return sentChange().jobs.find((held) => held.jobID === jobID);
}

beforeEach(() => {
  vi.clearAllMocks();
  standUpJobPlanner();
  serverHolds([]);
  saveJobsAsOneChange.mockResolvedValue("saved");
  restoreSavedJobs.mockResolvedValue(undefined);
  confirmMergeDiscards.mockResolvedValue(true);
  saveUserAccountDocument.mockResolvedValue(true);
  requestJobDocumentsByIdsFromApi.mockImplementation(readFromServer);
});

describe("merging two jobs that build the same item", () => {
  it("sends the replacement and removes what it replaced as one change", async () => {
    serverHolds(duplicates());

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(saveJobsAsOneChange).toHaveBeenCalledOnce();
    const { jobs, removed } = sentChange();
    expect(jobs.map((held) => held.jobID)).toEqual(["merged"]);
    expect(
      removed.map((held) => [held.jobID, held._meta.revision]).sort(),
    ).toEqual([
      ["old-1", 4],
      ["old-2", 4],
    ]);
  });

  it("clears the selection once the merge has landed", async () => {
    serverHolds(duplicates());
    const onMerged = vi.fn();

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne(), onMerged });

    expect(onMerged).toHaveBeenCalledOnce();
    expect(plannerJobIDs()).toEqual(["merged"]);
  });

  it("writes nothing when the jobs build different items", async () => {
    serverHolds([
      job({ jobID: "a", itemID: RIFTER }),
      job({ jobID: "b", itemID: 588 }),
    ]);

    const outcome = await mergeJobs(["a", "b"], { buildJob: buildsOne() });

    expect(outcome.mergedCount).toBe(0);
    expect(saveJobsAsOneChange).not.toHaveBeenCalled();
  });
});

describe("the jobs a merge works from", () => {
  it("reads the selection and what it links to from the server, not the planner's copies", async () => {
    serverHolds(linkedAround());
    plannerHolds(duplicates());

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(written("parent").build.childJobs[RIFTER]).toEqual(["merged"]);
    expect(written("child").parentJobs).toEqual(["merged"]);
  });

  it("drops a link to a job that no longer exists", async () => {
    const jobs = linkedAround().filter((held) => held.jobID !== "child");
    serverHolds(jobs);

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(written("merged").build.childJobs[34]).toEqual([]);
    expect(written("merged").parentJobs).toEqual(["parent"]);
  });
});

describe("a merge that touches a job open elsewhere", () => {
  it("sends nothing and names the job held", async () => {
    serverHolds(linkedAround());
    heldElsewhere("parent");
    const onMerged = vi.fn();

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne(), onMerged });

    expect(saveJobsAsOneChange).not.toHaveBeenCalled();
    expect(showMergeRefused.mock.calls[0][0]).toEqual([
      { jobID: "parent", name: "Wolf", reason: "held" },
    ]);
    expect(onMerged).not.toHaveBeenCalled();
  });
});

describe("what the replaced jobs recorded", () => {
  const purchased = {
    build: {
      materials: {
        34: {
          typeID: 34,
          name: "Tritanium",
          purchasing: { p1: { id: "p1", itemCount: 10, itemCost: 5 } },
        },
      },
    },
  };

  it("asks before discarding it, and sends nothing when the reader declines", async () => {
    serverHolds(duplicates(purchased));
    confirmMergeDiscards.mockResolvedValueOnce(false);

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(confirmMergeDiscards.mock.calls[0][0]).toEqual([
      expect.objectContaining({ jobID: "old-1", purchases: 1 }),
    ]);
    expect(saveJobsAsOneChange).not.toHaveBeenCalled();
  });

  it("merges when the reader confirms", async () => {
    serverHolds(duplicates(purchased));

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(saveJobsAsOneChange).toHaveBeenCalledOnce();
  });

  it("does not ask when the replaced jobs recorded nothing", async () => {
    serverHolds(duplicates());

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(confirmMergeDiscards).not.toHaveBeenCalled();
  });

  it("removes the replaced jobs' ESI links from the account and saves it", async () => {
    serverHolds(
      duplicates({
        esi: {
          industryJobs: { 500: { job_id: 500 } },
          marketOrders: {},
          transactions: {},
        },
      }),
    );
    const { addLinkedEsiData } = standUpJobPlanner();

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect([...addLinkedEsiData.mock.calls[0][0].jobsToRemove]).toEqual([500]);
    expect(saveUserAccountDocument).toHaveBeenCalledOnce();
  });
});

describe("releasing the replaced jobs' ESI links", () => {
  it("warns when the account could not be saved", async () => {
    serverHolds(
      duplicates({
        esi: {
          industryJobs: { 500: { job_id: 500 } },
          marketOrders: {},
          transactions: {},
        },
      }),
    );
    saveUserAccountDocument.mockResolvedValueOnce(false);
    const { showSnackbarWarning } =
      await import("../../../Events/snackbarEvents");

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("could not be saved to your account"),
      8,
    );
  });
});

describe("a merge the server refused", () => {
  it.each(["conflict", "locked"])(
    "puts back what it read, takes out the replacement and says what moved (%s)",
    async (outcome) => {
      serverHolds(linkedAround());
      saveJobsAsOneChange.mockResolvedValueOnce(outcome);
      restoreSavedJobs.mockImplementationOnce(async () => {
        storeHolder.current
          .getState()
          .jobData.actions.removeJobsFromJobArray(["merged", "old-2"]);
      });
      const onMerged = vi.fn();

      await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne(), onMerged });

      const [readIDs, newIDs] = restoreSavedJobs.mock.calls[0];
      expect([...readIDs].sort()).toEqual([
        "child",
        "old-1",
        "old-2",
        "parent",
      ]);
      expect(newIDs).toEqual(["merged"]);
      expect(showMergeRefused.mock.calls[0][0]).toEqual([
        { jobID: "old-2", name: "Rifter", reason: "gone" },
      ]);
      expect(onMerged).not.toHaveBeenCalled();
    },
  );

  it("offers to merge again from the jobs as they are now", async () => {
    serverHolds(duplicates());
    saveJobsAsOneChange.mockResolvedValueOnce("conflict");
    const buildJob = buildsOne();

    await mergeJobs(["old-1", "old-2"], { buildJob });
    const mergeAgain = showMergeRefused.mock.calls[0][1];
    await mergeAgain();

    expect(saveJobsAsOneChange).toHaveBeenCalledTimes(2);
    expect(requestJobDocumentsByIdsFromApi.mock.calls.at(-1)[0]).toEqual([
      "old-1",
      "old-2",
    ]);
  });
});

describe("a merge while signed out", () => {
  it("merges the planner's own jobs without reading or sending anything", async () => {
    standUpJobPlanner({ isLoggedIn: false });
    plannerHolds(duplicates());

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(requestJobDocumentsByIdsFromApi).not.toHaveBeenCalled();
    expect(saveJobsAsOneChange).not.toHaveBeenCalled();
    expect(plannerJobIDs()).toEqual(["merged"]);
  });
});

describe("what a merge discards", () => {
  it("counts each kind of record a replaced job holds", () => {
    const [discard] = recordsAMergeDiscards([
      {
        jobID: "a",
        name: "Rifter",
        build: {
          materials: {
            34: { purchasing: { p1: {}, p2: {} } },
            35: { purchasing: { p3: {} } },
          },
          extrasCosts: { e1: {} },
          inventionEntries: { i1: {} },
        },
        esi: {
          industryJobs: { 1: {} },
          marketOrders: { 2: {}, 3: {} },
          transactions: { 4: {} },
        },
      },
    ]);

    expect(discard).toEqual({
      jobID: "a",
      name: "Rifter",
      purchases: 3,
      extraCosts: 1,
      inventionEntries: 1,
      industryJobs: 1,
      marketOrders: 2,
      transactions: 1,
    });
  });

  it("leaves out a job that recorded nothing", () => {
    expect(
      recordsAMergeDiscards([
        { jobID: "a", name: "Rifter", build: {}, esi: {} },
      ]),
    ).toEqual([]);
  });
});
