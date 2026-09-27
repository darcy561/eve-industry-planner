import { beforeEach, describe, expect, it, vi } from "vitest";

import { activePlannerStoreState } from "../../tests/utils.js";

const storeState = activePlannerStoreState();
const updateOrAddJobsToJobArray = vi.fn();
const removeJobsFromJobArray = vi.fn();
storeState.account.isLoggedIn = true;
storeState.jobData.jobArray = [];
storeState.jobData.pendingJobDocumentWrites = {};
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

const {
  enqueueInboundJobDocumentChange,
  clearInboundJobDocumentCoalesce,
  JOBS_DELETED_REMOTELY_EVENT,
} = await import("./inboundJobDocumentsCoalesce.js");

const JOB = { jobID: "job-1" };

async function flush() {
  await vi.advanceTimersByTimeAsync(200);
}

beforeEach(() => {
  vi.useFakeTimers();
  clearInboundJobDocumentCoalesce();
  updateOrAddJobsToJobArray.mockClear();
  removeJobsFromJobArray.mockClear();
});

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

  it("lets the delete win when neither names a position", async () => {
    enqueueInboundJobDocumentChange("delete", "job-1", undefined, null);
    enqueueInboundJobDocumentChange("upsert", "job-1", JOB, null);
    await flush();

    expect(removeJobsFromJobArray).toHaveBeenCalledWith(["job-1"]);
    expect(updateOrAddJobsToJobArray).not.toHaveBeenCalled();
  });
});

describe("telling the app a job it held was deleted elsewhere", () => {
  it("names the deleted jobs once they are out of the store", async () => {
    const seen = [];
    const listener = (event) => seen.push(event.detail.jobIDs);
    window.addEventListener(JOBS_DELETED_REMOTELY_EVENT, listener);

    enqueueInboundJobDocumentChange("delete", "job-1", undefined, 5);
    enqueueInboundJobDocumentChange("delete", "job-2", undefined, 6);
    await flush();
    window.removeEventListener(JOBS_DELETED_REMOTELY_EVENT, listener);

    expect(seen).toEqual([["job-1", "job-2"]]);
    expect(removeJobsFromJobArray).toHaveBeenCalledWith(["job-1", "job-2"]);
  });

  it("says nothing when nothing was deleted", async () => {
    const seen = [];
    const listener = () => seen.push(true);
    window.addEventListener(JOBS_DELETED_REMOTELY_EVENT, listener);

    enqueueInboundJobDocumentChange("upsert", "job-1", JOB, 5);
    await flush();
    window.removeEventListener(JOBS_DELETED_REMOTELY_EVENT, listener);

    expect(seen).toEqual([]);
  });
});

describe("a document arriving for a job somebody has open", () => {
  const openSession = async (jobID, document) => {
    const { default: useUsersStore } =
      await import("../../Zustand/usersStore.js");
    const { editSession } = useUsersStore.getState();
    editSession.actions.closeSession();
    editSession.actions.openJob(jobID, document);
    return editSession;
  };

  const heldJob = (session, jobID) =>
    import("../../Components/Edit Job/Edit Job Hooks/jobDraftStore.js").then(
      ({ draftFor }) => draftFor(session.draft, jobID),
    );

  it("replaces what the editor started from, keeping what the reader changed", async () => {
    const session = await openSession("job-1", {
      jobID: "job-1",
      name: "Rifter",
      jobStatus: 1,
    });
    session.actions.run({
      name: "move to the next stage",
      recipe: (job) => {
        job.jobStatus = 2;
      },
    });

    enqueueInboundJobDocumentChange(
      "upsert",
      "job-1",
      { jobID: "job-1", name: "Renamed by somebody else", jobStatus: 1 },
      12,
    );
    await flush();

    const { default: useUsersStore } =
      await import("../../Zustand/usersStore.js");
    const job = await heldJob(useUsersStore.getState().editSession, "job-1");
    expect(job.name).toBe("Renamed by somebody else");
    expect(job.jobStatus).toBe(2);
  });

  it("does not break a run of typing it lands in the middle of", async () => {
    const session = await openSession("job-1", {
      jobID: "job-1",
      name: "Rifter",
      build: { setup: { "setup-1": { id: "setup-1", runCount: 1 } } },
    });
    const typed = (runCount) => ({
      name: "set run count",
      recipe: (job) => {
        job.build.setup["setup-1"].runCount = runCount;
      },
    });

    session.actions.run(typed(12));
    enqueueInboundJobDocumentChange(
      "upsert",
      "job-1",
      {
        jobID: "job-1",
        name: "Renamed by somebody else",
        build: { setup: { "setup-1": { id: "setup-1", runCount: 1 } } },
      },
      12,
    );
    await flush();
    session.actions.run(typed(123));

    const { default: useUsersStore } =
      await import("../../Zustand/usersStore.js");
    const held = useUsersStore.getState().editSession;
    expect(held.draft.log).toHaveLength(1);
    const job = await heldJob(held, "job-1");
    expect(job.build.setup["setup-1"].runCount).toBe(123);
    expect(job.name).toBe("Renamed by somebody else");
  });

  it("ignores a document for a job no editor is holding", async () => {
    const session = await openSession("job-1", { jobID: "job-1" });

    enqueueInboundJobDocumentChange("upsert", "job-2", { jobID: "job-2" }, 12);
    await flush();

    expect(session.draft.base["job-2"]).toBeUndefined();
  });
});
