import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERROR_REVISION_CONFLICT } from "../../Job/sync/revisionConflict.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../../DocumentLock/documentLockEvents.js";

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

function jobIDsIn(options) {
  try {
    const body = JSON.parse(options?.body ?? "{}");
    return (body.jobs ?? []).map((held) => held.jobID);
  } catch {
    return [];
  }
}

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

  it("names what the requests before the refused one wrote", async () => {
    const jobs = Array.from({ length: 150 }, (_, i) => job(`job-${i}`));

    fetch.mockImplementation((_url, options) =>
      Promise.resolve(
        jobIDsIn(options).includes("job-100")
          ? jsonResponse(
              409,
              revisionConflictBody([
                { docID: "job-100", expected: 4, current: 9 },
              ]),
            )
          : noContent(),
      ),
    );

    const err = await putJobDocumentsBatch(jobs).catch((e) => e);

    expect(err.code).toBe(CLIENT_ERROR_REVISION_CONFLICT);
    expect(err.deliveredBatchItems).toHaveLength(100);
    expect(err.deliveredBatchItems.at(0).jobID).toBe("job-0");
    expect(err.deliveredBatchItems.at(-1).jobID).toBe("job-99");
  });

  it("names nothing when the first request is the refused one", async () => {
    const jobs = Array.from({ length: 150 }, (_, i) => job(`job-${i}`));
    fetch.mockImplementation((_url, options) =>
      Promise.resolve(
        jobIDsIn(options).length > 0
          ? jsonResponse(
              409,
              revisionConflictBody([
                { docID: "job-0", expected: 4, current: 9 },
              ]),
            )
          : noContent(),
      ),
    );

    const err = await putJobDocumentsBatch(jobs).catch((e) => e);

    expect(err.deliveredBatchItems).toEqual([]);
  });

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
