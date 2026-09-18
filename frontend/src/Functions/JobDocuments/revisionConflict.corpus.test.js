import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  API_ERROR_REVISION_CONFLICT,
  parseRevisionConflictBody,
  revisionConflictMessage,
} from "./revisionConflict.js";
import { DOCUMENT_LOCK_API_ERROR_LOCK_HELD_ELSEWHERE } from "../DocumentLock/documentLockEvents.js";

// The 409 body, read from the repo root rather than copied here: the Go handler
// is tested against the same file, so a field renamed on one side alone turns
// the other side red. A drift here is silent in production — the client stops
// recognising the refusal and retries a write that can never succeed.
const corpusPath = resolve(
  process.cwd(),
  "../testing/fixtures/write-conflict/body.json",
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

describe("the refused-write body", () => {
  it("uses the error codes the corpus states", () => {
    expect(API_ERROR_REVISION_CONFLICT).toBe(
      corpus.errorCodes.revisionConflict,
    );
    expect(DOCUMENT_LOCK_API_ERROR_LOCK_HELD_ELSEWHERE).toBe(
      corpus.errorCodes.lockHeldElsewhere,
    );
  });

  it("parses the body the server sends", () => {
    const parsed = parseRevisionConflictBody(JSON.stringify(corpus.body));

    expect(parsed).not.toBeNull();
    expect(parsed.collection).toBe(corpus.body.collection);
    expect(parsed.saved).toBe(corpus.body.saved);
    expect(parsed.rejected).toHaveLength(corpus.body.rejected.length);
  });

  it("reads every field of every refused row", () => {
    const parsed = parseRevisionConflictBody(JSON.stringify(corpus.body));

    for (const [i, row] of corpus.body.rejected.entries()) {
      expect(parsed.rejected[i]).toEqual({
        docID: row.docID,
        expected: row.expected,
        current: row.current,
        // Absent on the wire for a document that is merely stale, which the
        // parser answers as false so a consumer never branches on undefined.
        gone: row.gone === true,
      });
    }
  });

  // The corpus body carries one stale row and one deleted row, which is the
  // mixed case: saying every job was removed would send the reader looking for
  // one that is still there.
  it("describes a mixed batch as changed rather than removed", () => {
    const parsed = parseRevisionConflictBody(JSON.stringify(corpus.body));
    const message = revisionConflictMessage(parsed.rejected);

    expect(message).toContain("changed elsewhere");
    expect(message).toContain(String(corpus.body.rejected.length));
  });
});
