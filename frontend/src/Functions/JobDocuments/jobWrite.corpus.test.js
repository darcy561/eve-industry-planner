import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { jobWriteEnvelope } from "./jobWriteEnvelope.js";

// The write envelope, read from the repo root rather than copied here: Go tests
// decode the same file, plan the stored update from it and drive it through the
// real handler, so a field renamed on one side alone turns the other side red.
// A drift here is silent until it reaches a user — the SPA sends a shape the
// endpoint refuses and every save 400s.
const corpusPath = resolve(
  process.cwd(),
  "../testing/fixtures/job-write/body.json",
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

/** The reader's copy of the job, as the store holds one. */
function job() {
  return {
    jobID: corpus.job.jobID,
    includedInGroup: corpus.job.includedInGroup,
    groupID: corpus.job.groupID,
    _meta: { revision: corpus.revision },
    toDocument: () => structuredClone(corpus.job),
  };
}

describe("the write envelope the corpus states", () => {
  it("is what a job and the reader's changes build", () => {
    expect(jobWriteEnvelope(job(), corpus.changes)).toEqual(corpus.write);
  });

  // The envelope's own revision is what marks a write as field-scoped. Sending
  // it as zero rather than leaving it out would route the write as a whole
  // document, which would store the partial as the entire job.
  it("leaves the revision out of a whole-document write", () => {
    const write = jobWriteEnvelope(job(), null);

    expect(write).not.toHaveProperty("revision");
    expect(write.document).toEqual(corpus.job);
  });
});
