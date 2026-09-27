import { describe, expect, it } from "vitest";

import { parseLockHeldElsewhereRefusal } from "./applyLockHeldElsewhereFromApiResponse.js";

const body = (extra = {}) =>
  JSON.stringify({
    error: "lock_held_elsewhere",
    collection: "job_documents",
    saved: 1,
    rejected: [{ docID: "job-held" }],
    ...extra,
  });

describe("the documents a partly refused batch wrote", () => {
  it("reads them from the body", () => {
    expect(
      parseLockHeldElsewhereRefusal(body({ savedDocIDs: ["job-1"] }))
        .savedDocIDs,
    ).toEqual(["job-1"]);
  });

  it("is empty when the body names none", () => {
    expect(parseLockHeldElsewhereRefusal(body()).savedDocIDs).toEqual([]);
  });

  it("answers nothing at all for a body that is not a lock conflict", () => {
    expect(
      parseLockHeldElsewhereRefusal(
        JSON.stringify({ error: "revision_conflict", rejected: [] }),
      ),
    ).toBeNull();
  });
});
