import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERROR_REVISION_CONFLICT } from "../../JobDocuments/revisionConflict.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../../DocumentLock/documentLockEvents.js";

// The write goes out through the real batching and error plumbing; only the
// network is replaced. Testing a level above this mocks the very code that has
// to recognise the body, which is what this file exists to cover.
// Only the session id is replaced. A factory that lists exports fails on setup
// the moment the module under test reaches for one it left out, with an error
// about the mock's shape rather than about behaviour.
vi.mock("../../Auth/tabSessionStorage.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getTabPlannerSessionID: () => "sess-test",
}));

const { putJobDocumentsBatch } = await import("./jobDocuments.js");

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The server answers a write that fully landed with 204 and no body. */
function noContent() {
  return new Response(null, { status: 204 });
}

function revisionConflictBody(rejected) {
  return {
    error: "revision_conflict",
    collection: "job_documents",
    saved: 0,
    rejected,
  };
}

/** One job as the endpoint serialises it. */
function job(jobID) {
  return { jobID, toDocument: () => ({ jobID }) };
}

describe("a 409 from the job write", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is recognised as a revision conflict and carries the refused rows", async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        409,
        revisionConflictBody([{ docID: "job-1", expected: 4, current: 9 }]),
      ),
    );

    const err = await putJobDocumentsBatch([job("job-1")]).catch((e) => e);

    expect(err.code).toBe(CLIENT_ERROR_REVISION_CONFLICT);
    expect(err.revisionConflict.rejected).toEqual([
      { docID: "job-1", expected: 4, current: 9, gone: false },
    ]);
  });

  // A lock conflict and a revision conflict are both a 409 carrying `rejected`.
  // Reading one as the other would clear the pending queue for a write that is
  // only blocked and could still succeed.
  it("is recognised as a lock conflict when the body says so", async () => {
    fetch.mockResolvedValue(
      jsonResponse(409, {
        error: "lock_held_elsewhere",
        collection: "job_documents",
        rejected: [{ docID: "job-1" }],
      }),
    );

    const err = await putJobDocumentsBatch([job("job-1")]).catch((e) => e);

    expect(err.code).toBe(DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE);
  });

  // The batch aggregator used to rewrap the first failure in a plain Error,
  // dropping `code` — so a conflict in any write of more than one chunk reached
  // the caller as an anonymous failure and was retried forever.
  it("survives a batch of more than one chunk", async () => {
    const jobs = Array.from({ length: 101 }, (_, i) => job(`job-${i}`));
    fetch
      .mockResolvedValueOnce(noContent())
      .mockResolvedValueOnce(
        jsonResponse(
          409,
          revisionConflictBody([{ docID: "job-100", expected: 1, current: 2 }]),
        ),
      );

    const err = await putJobDocumentsBatch(jobs).catch((e) => e);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(err.code).toBe(CLIENT_ERROR_REVISION_CONFLICT);
    expect(err.revisionConflict.rejected[0].docID).toBe("job-100");
  });
});
