import { beforeEach, describe, expect, it, vi } from "vitest";
import { standUpStore, storeHolder } from "../../tests/rawStoreHarness.js";

const putJobDocumentsBatch = vi.fn().mockResolvedValue(undefined);
const deleteJobDocumentsFromApi = vi.fn().mockResolvedValue(undefined);

vi.mock("../Endpoints/Private/jobDocuments.js", async (importOriginal) => ({
  ...(await importOriginal()),
  putJobDocumentsBatch: (...args) => putJobDocumentsBatch(...args),
  deleteJobDocumentsFromApi: (...args) => deleteJobDocumentsFromApi(...args),
}));

vi.mock("../Shared/normaliseParentChildRelationships.js", () => ({
  default: () => [],
}));

vi.mock("../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../Zustand/usersStore", async () => {
  const { rawStoreMock } = await import("../../tests/rawStoreHarness.js");
  return rawStoreMock();
});

const { default: mergeJobs } = await import("./mergeJobs.js");
const { default: Job } = await import("../../Classes/job.js");

const RIFTER = 587;

const actions = {
  mergeAndRemoveJobsFromJobArray: vi.fn(),
  updateOrAddJobsToJobArray: vi.fn(),
  getGroupObject: vi.fn(),
  updateModifiedGroups: vi.fn(),
  findJobInJobArray: vi.fn(),
};

/** The store these functions read, with nothing in the planner yet. */
function standUpPlanner() {
  standUpStore(() => ({
    account: {
      isLoggedIn: true,
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

function seedStore(jobs) {
  storeHolder.current.setState((state) => ({
    jobData: { ...state.jobData, jobArray: jobs },
  }));
}

/** Two jobs building the same item, which is what a merge is for. */
function duplicates() {
  return [
    new Job({ jobID: "old-1", name: "Rifter", itemID: RIFTER }),
    new Job({ jobID: "old-2", name: "Rifter", itemID: RIFTER }),
  ];
}

/** Stands in for the planner's own job builder, which needs the SDE. */
function buildsOne() {
  return vi.fn(async ({ itemID }) => new Job({ jobID: "merged", itemID }));
}

beforeEach(() => {
  vi.clearAllMocks();
  standUpPlanner();
  putJobDocumentsBatch.mockResolvedValue(undefined);
  deleteJobDocumentsFromApi.mockResolvedValue(undefined);
});

describe("merging two jobs that build the same item", () => {
  // Nothing records what a merge changed on the job it replaces them with, so
  // it is written whole and checked against the revision its own `_meta`
  // carries. A bare document here is refused by the endpoint outright.
  it("writes the replacement as a whole-document envelope", async () => {
    seedStore(duplicates());

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(putJobDocumentsBatch).toHaveBeenCalledOnce();
    const written = putJobDocumentsBatch.mock.calls[0][0];
    expect(written).toEqual([
      {
        jobID: "merged",
        includedInGroup: false,
        groupID: "",
        document: expect.objectContaining({ jobID: "merged" }),
      },
    ]);
  });

  it("removes the jobs it replaced once the replacement is saved", async () => {
    seedStore(duplicates());

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(deleteJobDocumentsFromApi).toHaveBeenCalledOnce();
    expect(deleteJobDocumentsFromApi.mock.calls[0][0].sort()).toEqual([
      "old-1",
      "old-2",
    ]);
  });
});

// A merge that removed its old jobs locally after the write failed would leave
// the planner holding one job where the server still holds two.
describe("a merge the server refused", () => {
  it("removes nothing from the planner", async () => {
    seedStore(duplicates());
    putJobDocumentsBatch.mockRejectedValueOnce(new Error("refused"));

    await expect(
      mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() }),
    ).rejects.toThrow("refused");

    expect(deleteJobDocumentsFromApi).not.toHaveBeenCalled();
    expect(actions.mergeAndRemoveJobsFromJobArray).not.toHaveBeenCalled();
  });
});

describe("merging jobs that build different items", () => {
  it("writes nothing, because there is nothing to merge", async () => {
    seedStore([
      new Job({ jobID: "a", itemID: RIFTER }),
      new Job({ jobID: "b", itemID: 588 }),
    ]);

    const outcome = await mergeJobs(["a", "b"], { buildJob: buildsOne() });

    expect(outcome.mergedCount).toBe(0);
    expect(putJobDocumentsBatch).not.toHaveBeenCalled();
  });
});

// The point of a merge is that everything pointing at the jobs it replaced ends
// up pointing at the replacement. A merge that wrote the new job but left the
// links behind would give the planner a parent building from jobs that no
// longer exist.
describe("what pointed at the jobs that were merged", () => {
  const RIFTER_PARENT = 11567;

  /** A parent building both duplicates, and a child both duplicates build from. */
  function linkedAround() {
    const merged = duplicates();
    const parent = new Job({
      jobID: "parent",
      itemID: RIFTER_PARENT,
      build: {
        materials: { [RIFTER]: { typeID: RIFTER, name: "Rifter" } },
        childJobs: { [RIFTER]: ["old-1", "old-2"] },
      },
    });
    const child = new Job({
      jobID: "child",
      itemID: 34,
      parentJobs: ["old-1", "old-2"],
    });
    for (const job of merged) {
      job.parentJobs = ["parent"];
      job.build.materials = { 34: { typeID: 34, name: "Tritanium" } };
      job.build.childJobs = { 34: ["child"] };
    }
    return { merged, parent, child };
  }

  /** What the merge wrote for one job, read out of the batch it sent. */
  function writtenDocument(jobID) {
    const written = putJobDocumentsBatch.mock.calls[0][0];
    return written.find((write) => write.jobID === jobID)?.document;
  }

  // Read from the write rather than from the job in the planner: the merge works
  // on copies and the planner is only updated once the writes have landed, so
  // the copy it sent is the only place the new links exist yet.
  it("points the parent at the replacement instead of what it replaced", async () => {
    const { merged, parent, child } = linkedAround();
    seedStore([...merged, parent, child]);

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(writtenDocument("parent").build.childJobs[RIFTER]).toEqual([
      "merged",
    ]);
  });

  it("points the child at the replacement instead of what it replaced", async () => {
    const { merged, parent, child } = linkedAround();
    seedStore([...merged, parent, child]);

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(writtenDocument("child").parentJobs).toEqual(["merged"]);
  });

  // The planner keeps what it had until the writes land, so a merge that failed
  // leaves no half-relinked job behind.
  it("leaves the planner's own copies alone", async () => {
    const { merged, parent, child } = linkedAround();
    seedStore([...merged, parent, child]);

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    expect(parent.build.childJobs[RIFTER]).toEqual(["old-1", "old-2"]);
    expect(child.parentJobs).toEqual(["old-1", "old-2"]);
  });

  it("saves the jobs it relinked alongside the replacement", async () => {
    const { merged, parent, child } = linkedAround();
    seedStore([...merged, parent, child]);

    await mergeJobs(["old-1", "old-2"], { buildJob: buildsOne() });

    const written = putJobDocumentsBatch.mock.calls[0][0];
    expect(written.map((write) => write.jobID).sort()).toEqual([
      "child",
      "merged",
      "parent",
    ]);
  });
});
