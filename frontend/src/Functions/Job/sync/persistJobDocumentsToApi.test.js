import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERROR_REVISION_CONFLICT } from "./revisionConflict.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../../DocumentLock/documentLockEvents.js";

const putJobDocumentsBatch = vi.fn();

vi.mock("../../Endpoints/Private/jobDocuments.js", async (importOriginal) => ({
  ...(await importOriginal()),
  putJobDocumentsBatch: (...args) => putJobDocumentsBatch(...args),
}));

const requestJobDocumentsByIdsFromApi = vi.fn(async (ids) => {
  const { default: store } = await import("../../../Zustand/usersStore.js");
  return store
    .getState()
    .jobData.jobArray.filter((job) => ids.includes(job.jobID));
});

vi.mock("../../Endpoints/Private/requestJobDocumentsByIds.js", () => ({
  requestJobDocumentsByIdsFromApi: (...args) =>
    requestJobDocumentsByIdsFromApi(...args),
}));

const warned = vi.fn();
vi.mock("../../../Events/snackbarEvents.js", () => ({
  showSnackbarWarning: (...args) => warned(...args),
}));

const { default: useUsersStore } =
  await import("../../../Zustand/usersStore.js");
const { persistJobDocumentsToApi, restoreSavedJobs } =
  await import("./persistJobDocumentsToApi.js");
const { jobFromDocument } = await import("../jobDocument.js");

function queued() {
  return Object.keys(useUsersStore.getState().jobData.pendingJobDocumentWrites);
}

function queueOneJob(jobID = "job-1") {
  useUsersStore.setState((state) => ({
    account: { ...state.account, isLoggedIn: true },
  }));
  useUsersStore
    .getState()
    .jobData.actions.queueJobDocumentWritesFromJobs([
      { jobID, toDocument: () => ({ jobID }) },
    ]);
}

function queueJobsAtRevisions(revisions) {
  useUsersStore.setState((state) => ({
    account: { ...state.account, isLoggedIn: true },
  }));
  const jobs = Object.entries(revisions).map(([jobID, revision]) => ({
    jobID,
    _meta: { revision },
    toDocument: () => ({ jobID, _meta: { revision } }),
  }));
  useUsersStore.getState().jobData.actions.queueJobDocumentWritesFromJobs(jobs);
}

function revisionOf(jobID) {
  return useUsersStore
    .getState()
    .jobData.jobArray.find((job) => job.jobID === jobID)?._meta?.revision;
}

function lockConflictError(docIDs, savedDocIDs = []) {
  const err = new Error("document lock held elsewhere (409)");
  err.code = DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE;
  err.lockHeldDocIDs = docIDs;
  err.savedDocIDs = savedDocIDs;
  return err;
}

function revisionConflictError(rejected, savedDocIDs = []) {
  const err = new Error("document revision conflict (409)");
  err.code = CLIENT_ERROR_REVISION_CONFLICT;
  err.revisionConflict = {
    collection: "job_documents",
    saved: savedDocIDs.length,
    savedDocIDs,
    rejected,
  };
  return err;
}

describe("a refused write leaves the queue", () => {
  beforeEach(() => {
    putJobDocumentsBatch.mockReset();
    warned.mockReset();
    requestJobDocumentsByIdsFromApi.mockClear();
    useUsersStore.getState().jobData.actions.resetJobDataStore();
  });

  it("clears the pending ids so the stale batch stops re-sending", async () => {
    queueOneJob();
    expect(queued()).toHaveLength(1);

    putJobDocumentsBatch.mockRejectedValueOnce(
      revisionConflictError([{ docID: "job-1", expected: 4, current: 9 }]),
    );

    const outcome = await persistJobDocumentsToApi();

    expect(outcome).toBe("conflict");
    expect(queued()).toHaveLength(0);
  });

  it("tells the user", async () => {
    queueOneJob();
    putJobDocumentsBatch.mockRejectedValueOnce(
      revisionConflictError([{ docID: "job-1", expected: 4, current: 9 }]),
    );

    await persistJobDocumentsToApi();

    expect(warned).toHaveBeenCalledOnce();
    expect(warned.mock.calls[0][0]).toContain("changed elsewhere");
  });

  it("drops a held write, puts the job back as saved and says which", async () => {
    queueOneJob();
    putJobDocumentsBatch.mockRejectedValueOnce(lockConflictError(["job-1"]));

    const outcome = await persistJobDocumentsToApi();

    expect(outcome).toBe("locked");
    expect(queued()).toEqual([]);
    expect(requestJobDocumentsByIdsFromApi).toHaveBeenCalledWith(["job-1"]);
    expect(warned).toHaveBeenCalledWith(
      "Not saved: another member is editing job-1, so it shows the saved version again.",
      8,
    );
  });

  it("drops a held write without fetching while the page is hidden", async () => {
    queueOneJob();
    putJobDocumentsBatch.mockRejectedValueOnce(lockConflictError(["job-1"]));
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");

    await persistJobDocumentsToApi();

    visibility.mockRestore();
    expect(queued()).toEqual([]);
    expect(requestJobDocumentsByIdsFromApi).not.toHaveBeenCalled();
  });

  it("counts what wrote beside the held job and puts back only the held one", async () => {
    queueOneJob("job-held");
    queueOneJob("job-wrote");

    putJobDocumentsBatch.mockRejectedValueOnce(
      lockConflictError(["job-held"], ["job-wrote"]),
    );

    await persistJobDocumentsToApi();

    expect(queued()).toEqual([]);
    expect(requestJobDocumentsByIdsFromApi).toHaveBeenCalledWith(["job-held"]);
  });

  it("keeps the whole queue when the conflict names nothing", async () => {
    queueOneJob("job-1");
    queueOneJob("job-2");
    const locked = new Error("document lock held elsewhere (409)");
    locked.code = DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE;
    putJobDocumentsBatch.mockRejectedValueOnce(locked);

    await persistJobDocumentsToApi();

    expect(queued()).toHaveLength(2);
    expect(requestJobDocumentsByIdsFromApi).not.toHaveBeenCalled();
  });

  it("reports a write that landed", async () => {
    queueOneJob();
    putJobDocumentsBatch.mockResolvedValueOnce(undefined);

    const outcome = await persistJobDocumentsToApi();

    expect(outcome).toBe("saved");
    expect(queued()).toHaveLength(0);
    expect(warned).not.toHaveBeenCalled();
  });
});

describe("a landed write counts against the jobs it wrote", () => {
  beforeEach(() => {
    putJobDocumentsBatch.mockReset();
    warned.mockReset();
    requestJobDocumentsByIdsFromApi.mockClear();
    useUsersStore.getState().jobData.actions.clearPendingJobDocumentWrites();
  });

  it("moves each written job on by one", async () => {
    queueJobsAtRevisions({ "job-1": 4, "job-2": 9 });
    putJobDocumentsBatch.mockResolvedValue(undefined);

    await persistJobDocumentsToApi();

    expect(revisionOf("job-1")).toBe(5);
    expect(revisionOf("job-2")).toBe(10);
  });

  it("leaves a job the lock held where it was", async () => {
    queueJobsAtRevisions({ "job-1": 4, "job-2": 9 });
    putJobDocumentsBatch.mockRejectedValue(
      lockConflictError(["job-2"], ["job-1"]),
    );

    await persistJobDocumentsToApi();

    expect(revisionOf("job-1")).toBe(5);
    expect(revisionOf("job-2")).toBe(9);
  });

  it("counts only what the answer names, not what it failed to mention", async () => {
    queueJobsAtRevisions({ "job-held": 2, "job-moved": 4, "job-clean": 6 });
    putJobDocumentsBatch.mockRejectedValue(
      lockConflictError(["job-held"], ["job-clean"]),
    );

    await persistJobDocumentsToApi();

    expect(revisionOf("job-clean")).toBe(7);
    expect(revisionOf("job-moved")).toBe(4);
    expect(revisionOf("job-held")).toBe(2);
    expect(queued()).toEqual(["job-moved"]);
  });

  it("counts the parts that landed before the part that failed", async () => {
    queueJobsAtRevisions({ "job-early": 4, "job-late": 9 });
    const err = revisionConflictError(
      [{ docID: "job-late", expected: 9, current: 12 }],
      [],
    );
    err.deliveredBatchItems = [{ jobID: "job-early" }];
    putJobDocumentsBatch.mockRejectedValue(err);

    await persistJobDocumentsToApi();

    expect(revisionOf("job-early")).toBe(5);
    expect(revisionOf("job-late")).toBe(9);
    expect(queued()).not.toContain("job-early");
  });

  it("keeps a job the failed answer never mentioned", async () => {
    queueJobsAtRevisions({ "job-1": 4, "job-unsent": 9 });
    putJobDocumentsBatch.mockRejectedValue(
      revisionConflictError([{ docID: "job-1", expected: 4, current: 7 }], []),
    );

    await persistJobDocumentsToApi();

    expect(queued()).toContain("job-unsent");
    expect(queued()).not.toContain("job-1");
  });

  it("leaves a job the revision check refused where it was", async () => {
    queueJobsAtRevisions({ "job-1": 4, "job-2": 9 });
    putJobDocumentsBatch.mockRejectedValue(
      revisionConflictError(
        [{ docID: "job-2", expected: 9, current: 11 }],
        ["job-1"],
      ),
    );

    await persistJobDocumentsToApi();

    expect(revisionOf("job-1")).toBe(5);
    expect(revisionOf("job-2")).toBe(9);
  });
});

describe("a write the server refuses to read", () => {
  beforeEach(() => {
    putJobDocumentsBatch.mockReset();
    warned.mockReset();
    requestJobDocumentsByIdsFromApi.mockClear();
    useUsersStore.getState().jobData.actions.resetJobDataStore();
  });

  function unreadableWriteError() {
    const err = new Error("PUT /api/v1/job-documents failed: 400");
    err.status = 400;
    return err;
  }

  it("drops the ids it sent rather than retrying forever", async () => {
    queueOneJob("job-1");
    putJobDocumentsBatch.mockRejectedValueOnce(unreadableWriteError());

    const outcome = await persistJobDocumentsToApi();

    expect(outcome).toBe("failed");
    expect(queued()).toHaveLength(0);
  });

  it("tells the reader the changes were discarded", async () => {
    queueOneJob("job-1");
    putJobDocumentsBatch.mockRejectedValueOnce(unreadableWriteError());

    await persistJobDocumentsToApi();

    expect(warned).toHaveBeenCalledOnce();
    expect(warned.mock.calls[0][0]).toContain("could not be saved");
  });

  it("credits the parts that landed before the part that was refused", async () => {
    queueJobsAtRevisions({ "job-early": 4, "job-bad": 9 });
    const err = unreadableWriteError();
    err.deliveredBatchItems = [{ jobID: "job-early" }];
    putJobDocumentsBatch.mockRejectedValueOnce(err);

    await persistJobDocumentsToApi();

    expect(revisionOf("job-early")).toBe(5);
    expect(revisionOf("job-bad")).toBe(9);
  });

  it("leaves a change queued while the request was in the air", async () => {
    queueOneJob("job-1");
    putJobDocumentsBatch.mockImplementationOnce(async () => {
      queueOneJob("job-during");
      throw unreadableWriteError();
    });

    await persistJobDocumentsToApi();

    expect(queued()).toEqual(["job-during"]);
  });
});

describe("putting a refused change's jobs back as they are saved", () => {
  beforeEach(() => {
    useUsersStore.getState().jobData.actions.resetJobDataStore();
    useUsersStore.getState().editSession.actions.closeSession();
  });

  it("takes the saved copies, drops the jobs that are gone and the new ones it would have made", async () => {
    const { jobData, editSession } = useUsersStore.getState();
    jobData.actions.updateOrAddJobsToJobArray([
      jobFromDocument({ jobID: "edited", name: "changed here" }),
      jobFromDocument({ jobID: "linked", name: "resized here" }),
      jobFromDocument({ jobID: "deleted", name: "still held" }),
      jobFromDocument({ jobID: "created", name: "never saved" }),
    ]);
    editSession.actions.openJob("edited", {
      jobID: "edited",
      name: "changed here",
    });
    requestJobDocumentsByIdsFromApi.mockResolvedValueOnce([
      jobFromDocument({
        jobID: "edited",
        name: "as saved",
        _meta: { revision: 5 },
      }),
      jobFromDocument({
        jobID: "linked",
        name: "as saved",
        _meta: { revision: 2 },
      }),
    ]);

    await restoreSavedJobs(["edited", "linked", "deleted"], ["created"]);

    const held = Object.fromEntries(
      useUsersStore
        .getState()
        .jobData.jobArray.map((job) => [job.jobID, job.name]),
    );
    expect(held).toEqual({ edited: "as saved", linked: "as saved" });
    expect(useUsersStore.getState().editSession.draft.base.edited.name).toBe(
      "as saved",
    );
  });

  it("says so and still answers when the saved jobs cannot be read back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    warned.mockReset();
    useUsersStore
      .getState()
      .jobData.actions.updateOrAddJobsToJobArray([
        jobFromDocument({ jobID: "created", name: "never saved" }),
      ]);
    requestJobDocumentsByIdsFromApi.mockRejectedValueOnce(new Error("offline"));

    await expect(
      restoreSavedJobs(["edited"], ["created"]),
    ).resolves.toBeUndefined();

    expect(useUsersStore.getState().jobData.jobArray).toEqual([]);
    expect(warned).toHaveBeenCalledWith(
      expect.stringContaining("could not be read back"),
      8,
    );
  });
});
