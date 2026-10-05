import { beforeEach, describe, expect, it, vi } from "vitest";

import { heldJobs, keptPositions } from "../../../tests/inboundDelivery.js";
import { activePlannerStoreState } from "../../../tests/utils.js";

const storeState = activePlannerStoreState();
const documentArrived = vi.fn();
const held = { jobs: [] };
const positions = {};

storeState.account.isLoggedIn = true;
storeState.jobData = heldJobs(held);
storeState.websocketSync = keptPositions(positions);
const { updateOrAddJobsToJobArray } = storeState.jobData.actions;
storeState.editSession = {
  ...storeState.editSession,
  actions: { ...storeState.editSession?.actions, documentArrived },
};

vi.mock("../../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});

const reread = vi.fn();
vi.mock("../../Endpoints/Private/requestJobDocumentsByIds.js", () => ({
  requestJobDocumentsByIdsFromApi: (jobIDs) => reread(jobIDs[0]),
}));

const { enqueueInboundJobDocumentChange, clearInboundJobDocumentCoalesce } =
  await import("./inboundJobDocuments.js");
const { jobFromDocument } = await import("../jobDocument.js");

function storedJob(revision, name = "Before") {
  return jobFromDocument({
    jobID: "job-1",
    itemID: 587,
    name,
    _meta: { revision },
  });
}

function delivery(document, revision, appliesTo, changed, jobID = "job-1") {
  return [
    "upsert",
    jobID,
    document,
    revision,
    {
      changed: Object.entries(changed).map(([key, value]) => ({
        path: [key],
        value,
      })),
      removed: [],
      revision,
      appliesTo,
    },
  ];
}

function readThatWaits() {
  let settle;
  const pending = new Promise((resolve) => (settle = resolve));
  return { pending, settle: (jobs) => settle(jobs) };
}

function heldRevision(jobID = "job-1") {
  return held.jobs.find((job) => job.jobID === jobID)?._meta?.revision;
}

async function flush() {
  await vi.advanceTimersByTimeAsync(200);
}

function applied() {
  const [jobs] = updateOrAddJobsToJobArray.mock.calls.at(-1) ?? [[]];
  return jobs[0];
}

beforeEach(() => {
  vi.useFakeTimers();
  clearInboundJobDocumentCoalesce();
  updateOrAddJobsToJobArray.mockClear();
  documentArrived.mockClear();
  reread.mockClear();
  storeState.websocketSync.actions.setPositionBatch.mockClear();
  reread.mockResolvedValue([]);
  held.jobs = [storedJob(7)];
  for (const key of Object.keys(positions)) delete positions[key];
});

describe("a delta arriving for a job this client holds", () => {
  it("is applied onto the document the client already has", async () => {
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 8, 7, { name: "After" }),
    );
    await flush();

    expect(applied().name).toBe("After");
    expect(applied()._meta.revision).toBe(8);
    expect(reread).not.toHaveBeenCalled();
  });

  it("is applied in order when two arrive in one window", async () => {
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 8, 7, { name: "Middle" }),
    );
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 9, 8, { name: "Last" }),
    );
    await flush();

    expect(applied().name).toBe("Last");
    expect(applied()._meta.revision).toBe(9);
    expect(reread).not.toHaveBeenCalled();
  });

  it("is skipped when the client already holds what it produced", async () => {
    held.jobs = [storedJob(9, "Already")];
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 8, 7, { name: "Older" }),
    );
    await flush();

    expect(applied().name).toBe("Already");
    expect(reread).not.toHaveBeenCalled();
  });

  it("reads the job again when a delivery between the two was missed", async () => {
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 12, 11, { name: "After a gap" }),
    );
    await flush();

    expect(reread).toHaveBeenCalledWith("job-1");
    expect(updateOrAddJobsToJobArray).toHaveBeenCalledWith([]);
  });

  it("hands an open editor the folded document, not the one that arrived", async () => {
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1", name: "Whole" }, 8, 7, { name: "Folded" }),
    );
    await flush();

    expect(documentArrived).toHaveBeenCalledTimes(1);
    const [jobID, document] = documentArrived.mock.calls[0];
    expect(jobID).toBe("job-1");
    expect(document.name).toBe("Folded");
    expect(document._meta.revision).toBe(8);
  });

  it("leaves a gapped job's position alone, so a redelivery is not discarded", async () => {
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 12, 11, { name: "After a gap" }),
    );
    await flush();

    expect(documentArrived).not.toHaveBeenCalled();
    expect(
      storeState.websocketSync.actions.setPositionBatch,
    ).toHaveBeenCalledWith([]);
  });

  it("reads a gapped job once while the read is still in flight", async () => {
    let settle;
    reread.mockReturnValue(new Promise((resolve) => (settle = resolve)));

    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 12, 11, { name: "First gap" }),
    );
    await flush();
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 13, 12, { name: "Second gap" }),
    );
    await flush();

    expect(reread).toHaveBeenCalledTimes(1);
    settle([]);
    await vi.runAllTimersAsync();
  });

  it("does not let a slow read undo what the client has since applied", async () => {
    reread.mockResolvedValue([storedJob(7, "Stale")]);
    held.jobs = [storedJob(9, "Newer")];

    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 12, 11, { name: "After a gap" }),
    );
    await flush();
    await vi.runAllTimersAsync();

    const wrote = updateOrAddJobsToJobArray.mock.calls.flatMap(
      ([jobs]) => jobs,
    );
    expect(wrote.some((job) => job?.name === "Stale")).toBe(false);
  });

  it("takes the whole document for a job the client does not hold yet", async () => {
    held.jobs = [];
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1", name: "Whole" }, 8, 7, { name: "After" }),
    );
    await flush();

    expect(applied().name).toBe("Whole");
    expect(reread).not.toHaveBeenCalled();
  });

  it("takes the whole document when the delivery carries no delta", async () => {
    enqueueInboundJobDocumentChange(
      "upsert",
      "job-1",
      { jobID: "job-1", name: "Whole" },
      8,
    );
    await flush();

    expect(applied().name).toBe("Whole");
    expect(reread).not.toHaveBeenCalled();
  });
});

describe("a window of deliveries for one job", () => {
  it("folds a delta onto the whole document the same window carried", async () => {
    enqueueInboundJobDocumentChange(
      "upsert",
      "job-1",
      { jobID: "job-1", itemID: 587, name: "Whole", _meta: { revision: 9 } },
      9,
    );
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 10, 9, { name: "Last" }),
    );
    await flush();

    expect(applied().name).toBe("Last");
    expect(applied()._meta.revision).toBe(10);
    expect(reread).not.toHaveBeenCalled();
  });

  it("skips a delta already held and applies the one after it", async () => {
    held.jobs = [storedJob(8, "Held")];
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 8, 7, { name: "Already" }),
    );
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 9, 8, { name: "Next" }),
    );
    await flush();

    expect(applied().name).toBe("Next");
    expect(applied()._meta.revision).toBe(9);
    expect(reread).not.toHaveBeenCalled();
  });

  it("takes the whole document for a job this tab still has unsent writes for", async () => {
    storeState.jobData.pendingJobDocumentWrites = { "job-1": true };
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1", name: "Whole" }, 8, 7, { name: "Folded" }),
    );
    await flush();
    storeState.jobData.pendingJobDocumentWrites = {};

    expect(applied().name).toBe("Whole");
  });

  it("records the position a delivered delta was applied at", async () => {
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 8, 7, { name: "After" }),
    );
    await flush();

    expect(
      storeState.websocketSync.actions.setPositionBatch,
    ).toHaveBeenCalledWith([["job_documents.job-1", 8]]);
  });

  it("takes nothing while nobody is signed in", async () => {
    storeState.account.isLoggedIn = false;
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 8, 7, { name: "After" }),
    );
    await flush();
    storeState.account.isLoggedIn = true;

    expect(updateOrAddJobsToJobArray).not.toHaveBeenCalled();
  });

  it("reads each job that gapped in one flush", async () => {
    held.jobs = [storedJob(7), { ...storedJob(7), jobID: "job-2" }];
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 12, 11, { name: "Gap" }),
    );
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-2" }, 12, 11, { name: "Gap" }, "job-2"),
    );
    await flush();

    expect(reread).toHaveBeenCalledWith("job-1");
    expect(reread).toHaveBeenCalledWith("job-2");
  });
});

describe("reading a job again after a gap", () => {
  it("asks again when the job gapped once more while its read was out", async () => {
    held.jobs = [storedJob(10)];
    const first = readThatWaits();
    const second = readThatWaits();
    reread
      .mockReturnValueOnce(first.pending)
      .mockReturnValueOnce(second.pending);

    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 12, 11, { name: "Gap" }),
    );
    await flush();
    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 13, 12, { name: "Newer gap" }),
    );
    await flush();

    first.settle([storedJob(12, "Read before the newer write")]);
    await vi.runAllTimersAsync();
    expect(reread).toHaveBeenCalledTimes(2);

    second.settle([storedJob(13, "Read after it")]);
    await vi.runAllTimersAsync();
    expect(heldRevision()).toBe(13);
  });

  it("does not bring back a job deleted while its read was out", async () => {
    held.jobs = [storedJob(10)];
    const read = readThatWaits();
    reread.mockReturnValueOnce(read.pending);

    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 12, 11, { name: "Gap" }),
    );
    await flush();
    held.jobs = [];
    read.settle([storedJob(12)]);
    await vi.runAllTimersAsync();

    expect(held.jobs).toEqual([]);
  });

  it("does not take a read into a planner the reader has since left", async () => {
    held.jobs = [storedJob(10)];
    const read = readThatWaits();
    reread.mockReturnValueOnce(read.pending);

    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 12, 11, { name: "Gap" }),
    );
    await flush();
    storeState.activePlanner.owner = "corporation:elsewhere";
    read.settle([storedJob(12)]);
    await vi.runAllTimersAsync();
    storeState.activePlanner.owner = null;

    expect(heldRevision()).toBe(10);
  });

  it("does not take a read that returns after the session was torn down", async () => {
    held.jobs = [storedJob(10)];
    const read = readThatWaits();
    reread.mockReturnValueOnce(read.pending);

    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 12, 11, { name: "Gap" }),
    );
    await flush();
    clearInboundJobDocumentCoalesce();
    read.settle([storedJob(12)]);
    await vi.runAllTimersAsync();

    expect(heldRevision()).toBe(10);
  });

  it("leaves the job where it was when the read fails", async () => {
    held.jobs = [storedJob(10)];
    reread.mockRejectedValueOnce(new Error("offline"));

    enqueueInboundJobDocumentChange(
      ...delivery({ jobID: "job-1" }, 12, 11, { name: "Gap" }),
    );
    await flush();
    await vi.runAllTimersAsync();

    expect(heldRevision()).toBe(10);
  });
});
