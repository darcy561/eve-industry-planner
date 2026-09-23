import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERROR_REVISION_CONFLICT } from "./revisionConflict.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../DocumentLock/documentLockEvents.js";

const putJobDocumentsBatch = vi.fn();
// Only the write is replaced: the module also exports the collection name, which
// the websocket handlers import, and a mock that drops it breaks their import.
vi.mock("../Endpoints/Private/jobDocuments.js", async (importOriginal) => ({
  ...(await importOriginal()),
  putJobDocumentsBatch: (...args) => putJobDocumentsBatch(...args),
}));

const warned = vi.fn();
vi.mock("../../Events/snackbarEvents.js", () => ({
  showSnackbarWarning: (...args) => warned(...args),
}));

const { default: useUsersStore } = await import("../../Zustand/usersStore.js");
const { persistJobDocumentsToApi } =
  await import("./persistJobDocumentsToApi.js");

function queued() {
  return Object.keys(useUsersStore.getState().jobData.pendingJobDocumentWrites);
}

/** Queues one job id with a document behind it, as a real edit would. */
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

/** Queues several jobs, each holding the revision it was delivered at. */
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
    useUsersStore.getState().jobData.actions.resetJobDataStore();
  });

  // The queue holds job ids and resolves them against `jobArray` at flush time,
  // so a kept id re-sends whatever the array holds against a document the server
  // has already refused. That write cannot start succeeding, so keeping it is an
  // endless loop with nothing shown to the user.
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

  // A lock conflict is a different outcome: the document is blocked, not stale,
  // so the write can still succeed later and its ids stay queued.
  it("keeps the queue for a lock conflict", async () => {
    queueOneJob();
    putJobDocumentsBatch.mockRejectedValueOnce(lockConflictError(["job-1"]));

    const outcome = await persistJobDocumentsToApi();

    expect(outcome).toBe("locked");
    expect(queued()).toHaveLength(1);
    expect(warned).not.toHaveBeenCalled();
  });

  // The server drops held jobs and writes the rest, so a lock conflict no longer
  // means nothing landed. Keeping the whole queue would re-send jobs that
  // already saved; clearing it would lose the edits still owed.
  it("keeps only the held ids when part of the batch wrote", async () => {
    queueOneJob("job-held");
    queueOneJob("job-wrote");
    expect(queued()).toHaveLength(2);

    putJobDocumentsBatch.mockRejectedValueOnce(
      lockConflictError(["job-held"], ["job-wrote"]),
    );

    const outcome = await persistJobDocumentsToApi();

    expect(outcome).toBe("locked");
    expect(queued()).toEqual(["job-held"]);
  });

  // A conflict naming no documents cannot be told apart from one naming every
  // document, so the whole queue is kept rather than guessed at.
  it("keeps the whole queue when the conflict names nothing", async () => {
    queueOneJob("job-1");
    queueOneJob("job-2");
    const locked = new Error("document lock held elsewhere (409)");
    locked.code = DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE;
    putJobDocumentsBatch.mockRejectedValueOnce(locked);

    await persistJobDocumentsToApi();

    expect(queued()).toHaveLength(2);
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

// The server counts a write by moving the document on by one and refuses a write
// built on an older count. A client that waited for the document to come back
// would be stale in between, and a second edit in that window would be refused
// against nothing but its own earlier write.
describe("a landed write counts against the jobs it wrote", () => {
  beforeEach(() => {
    putJobDocumentsBatch.mockReset();
    warned.mockReset();
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

  // A batch can hold one document and refuse another on its revision, and the
  // answer states one of the two. Working out what wrote by taking the refusals
  // away from what was sent would count the one nothing said anything about.
  it("counts only what the answer names, not what it failed to mention", async () => {
    queueJobsAtRevisions({ "job-held": 2, "job-moved": 4, "job-clean": 6 });
    putJobDocumentsBatch.mockRejectedValue(
      lockConflictError(["job-held"], ["job-clean"]),
    );

    await persistJobDocumentsToApi();

    expect(revisionOf("job-clean")).toBe(7);
    expect(revisionOf("job-moved")).toBe(4);
    expect(revisionOf("job-held")).toBe(2);
    expect(queued()).toEqual(expect.arrayContaining(["job-held", "job-moved"]));
    expect(queued()).not.toContain("job-clean");
  });

  // A part that landed before the part that failed is credited from the error,
  // because the answer describes only the request it came from. Left uncredited,
  // those jobs would be sent again against documents they had already written,
  // and refused as stale — losing work that had in fact been saved.
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

  // Above the request limit a save is sent in parts, so a part that was refused
  // says nothing about the parts behind it and they stay owed.
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
