import { describe, expect, it } from "vitest";
import { parseLockHeldElsewhereBody } from "./applyLockHeldElsewhereFromApiResponse.js";

function lockBody(rejected, saved) {
  return JSON.stringify({
    error: "lock_held_elsewhere",
    collection: "job_documents",
    ...(saved === undefined ? {} : { saved }),
    rejected,
  });
}

describe("parseLockHeldElsewhereBody", () => {
  it("names the held documents", () => {
    expect(
      parseLockHeldElsewhereBody(lockBody([{ docID: "job-1" }], 3)),
    ).toEqual(["job-1"]);
  });

  it("names every held document, not only the first", () => {
    expect(
      parseLockHeldElsewhereBody(
        lockBody([{ docID: "job-1" }, { docID: "job-2" }], 1),
      ),
    ).toEqual(["job-1", "job-2"]);
  });

  // A revision conflict is also a 409 carrying `rejected`. Reading one as the
  // other would clear the pending queue for documents that are merely blocked.
  it("is not a revision conflict", () => {
    const revision = JSON.stringify({
      error: "revision_conflict",
      collection: "job_documents",
      rejected: [{ jobID: "job-1", expected: 4, current: 9 }],
    });
    expect(parseLockHeldElsewhereBody(revision)).toBeNull();
  });

  it("is null for a body that is not JSON", () => {
    expect(parseLockHeldElsewhereBody("<html>nope</html>")).toBeNull();
  });

  it("is null when no row names a document", () => {
    expect(
      parseLockHeldElsewhereBody(lockBody([{ holderSessionID: "s" }])),
    ).toBeNull();
  });
});
