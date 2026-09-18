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
  return useUsersStore.getState().jobData.pendingJobDocumentWrites;
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

function lockConflictError(docIDs) {
  const err = new Error("document lock held elsewhere (409)");
  err.code = DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE;
  err.lockHeldDocIDs = docIDs;
  return err;
}

function revisionConflictError(rejected) {
  const err = new Error("document revision conflict (409)");
  err.code = CLIENT_ERROR_REVISION_CONFLICT;
  err.revisionConflict = { collection: "job_documents", saved: 0, rejected };
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

    putJobDocumentsBatch.mockRejectedValueOnce(lockConflictError(["job-held"]));

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
