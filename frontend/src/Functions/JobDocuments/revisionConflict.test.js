import { describe, it, expect } from "vitest";
import {
  parseRevisionConflictBody,
  revisionConflictMessage,
} from "./revisionConflict.js";

function conflictBody(rejected, extra = {}) {
  return JSON.stringify({
    error: "revision_conflict",
    collection: "job_documents",
    saved: 0,
    rejected,
    ...extra,
  });
}

describe("parseRevisionConflictBody", () => {
  it("reads the refused rows", () => {
    const parsed = parseRevisionConflictBody(
      conflictBody([{ docID: "job-1", expected: 4, current: 9 }], { saved: 2 }),
    );
    expect(parsed).toEqual({
      collection: "job_documents",
      saved: 2,
      rejected: [{ docID: "job-1", expected: 4, current: 9, gone: false }],
    });
  });

  it("carries gone through, so a deleted job is not reported as changed", () => {
    const parsed = parseRevisionConflictBody(
      conflictBody([{ docID: "job-1", expected: 4, current: 0, gone: true }]),
    );
    expect(parsed?.rejected[0].gone).toBe(true);
  });

  // A lock conflict and a revision conflict are both 409 with a `rejected`
  // array. Answering a lock conflict here would clear the pending queue for a
  // write that is only blocked, discarding work that could still be saved.
  it("is not a lock conflict", () => {
    const lockBody = JSON.stringify({
      error: "lock_held_elsewhere",
      collection: "job_documents",
      rejected: [{ docID: "job-1" }],
    });
    expect(parseRevisionConflictBody(lockBody)).toBeNull();
  });

  it("is null for a body that is not JSON", () => {
    expect(parseRevisionConflictBody("<html>nope</html>")).toBeNull();
  });

  it("is null when no row names a job", () => {
    expect(
      parseRevisionConflictBody(conflictBody([{ expected: 4 }])),
    ).toBeNull();
  });
});

describe("revisionConflictMessage", () => {
  it("says removed when every refused job is gone", () => {
    const msg = revisionConflictMessage([{ gone: true }]);
    expect(msg).toContain("removed");
    expect(msg).not.toContain("changed elsewhere");
  });

  // A mixed batch cannot claim every job was removed; "changed" is true of the
  // batch as a whole and sends the reader somewhere that exists.
  it("says changed when only some are gone", () => {
    const msg = revisionConflictMessage([{ gone: true }, { gone: false }]);
    expect(msg).toContain("changed elsewhere");
  });

  it("counts more than one", () => {
    expect(
      revisionConflictMessage([{ gone: false }, { gone: false }]),
    ).toContain("2 jobs");
  });
});
