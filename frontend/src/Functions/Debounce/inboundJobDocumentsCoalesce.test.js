import { beforeEach, describe, expect, it, vi } from "vitest";

import { activePlannerStoreState } from "../../tests/utils.js";

const storeState = activePlannerStoreState();
const updateOrAddJobsToJobArray = vi.fn();
const removeJobsFromJobArray = vi.fn();
storeState.account.isLoggedIn = true;
storeState.jobData.jobArray = [];
storeState.jobData.pendingJobDocumentWrites = [];
storeState.jobData.actions = {
  ...storeState.jobData.actions,
  updateOrAddJobsToJobArray,
  removeJobsFromJobArray,
  addPendingInboundNewJobSkeleton: vi.fn(),
  removePendingInboundNewJobSkeletons: vi.fn(),
  clearPendingJobDocumentWrites: vi.fn(),
};

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});
vi.mock("../../Classes/job.js", () => ({
  default: class {
    constructor(doc) {
      Object.assign(this, doc);
    }
  },
}));

const { enqueueInboundJobDocumentChange, clearInboundJobDocumentCoalesce } =
  await import("./inboundJobDocumentsCoalesce.js");

const JOB = { jobID: "job-1" };

/** Runs the queue's flush without waiting out its debounce. */
async function flush() {
  await vi.advanceTimersByTimeAsync(200);
}

beforeEach(() => {
  vi.useFakeTimers();
  clearInboundJobDocumentCoalesce();
  updateOrAddJobsToJobArray.mockClear();
  removeJobsFromJobArray.mockClear();
});

// Restoring an archived job writes the same jobID back, so a delete and an upsert
// for one document can land inside a single flush window. Which one happened is
// what the position answers; before it, the delete won and the job never came back.
describe("a delete and an upsert for the same job in one window", () => {
  it("keeps the later upsert when the delete came first", async () => {
    enqueueInboundJobDocumentChange("delete", "job-1", undefined, 10);
    enqueueInboundJobDocumentChange("upsert", "job-1", JOB, 11);
    await flush();

    expect(updateOrAddJobsToJobArray).toHaveBeenCalled();
    expect(removeJobsFromJobArray).not.toHaveBeenCalled();
  });

  it("keeps the later delete when the upsert came first", async () => {
    enqueueInboundJobDocumentChange("upsert", "job-1", JOB, 10);
    enqueueInboundJobDocumentChange("delete", "job-1", undefined, 11);
    await flush();

    expect(removeJobsFromJobArray).toHaveBeenCalledWith(["job-1"]);
    expect(updateOrAddJobsToJobArray).not.toHaveBeenCalled();
  });

  it("discards an upsert from behind the queued delete", async () => {
    enqueueInboundJobDocumentChange("delete", "job-1", undefined, 11);
    enqueueInboundJobDocumentChange("upsert", "job-1", JOB, 4);
    await flush();

    expect(removeJobsFromJobArray).toHaveBeenCalledWith(["job-1"]);
    expect(updateOrAddJobsToJobArray).not.toHaveBeenCalled();
  });

  // With nothing to order them by, a resurrected row is the worse mistake.
  it("lets the delete win when neither names a position", async () => {
    enqueueInboundJobDocumentChange("delete", "job-1", undefined, null);
    enqueueInboundJobDocumentChange("upsert", "job-1", JOB, null);
    await flush();

    expect(removeJobsFromJobArray).toHaveBeenCalledWith(["job-1"]);
    expect(updateOrAddJobsToJobArray).not.toHaveBeenCalled();
  });
});
