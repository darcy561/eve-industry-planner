import { describe, expect, it } from "vitest";

import { parseLockHeldElsewhereSaved } from "./applyLockHeldElsewhereFromApiResponse.js";

const body = (extra = {}) =>
  JSON.stringify({
    error: "lock_held_elsewhere",
    collection: "job_documents",
    saved: 1,
    rejected: [{ docID: "job-held" }],
    ...extra,
  });

// The answer names what was held, and separately what was written. A caller
// cannot work the second out from the first: one batch can hold a document and
// refuse another for a different reason the answer does not mention.
describe("the documents a partly refused batch wrote", () => {
  it("reads them from the body", () => {
    expect(
      parseLockHeldElsewhereSaved(body({ savedDocIDs: ["job-1"] })),
    ).toEqual(["job-1"]);
  });

  it("is empty when the body names none", () => {
    expect(parseLockHeldElsewhereSaved(body())).toEqual([]);
  });

  it("is empty for a body that is not a lock conflict", () => {
    expect(
      parseLockHeldElsewhereSaved(
        JSON.stringify({ error: "revision_conflict", rejected: [] }),
      ),
    ).toEqual([]);
  });
});
