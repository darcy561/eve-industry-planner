import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { jobWriteEnvelope } from "./jobWriteEnvelope.js";

const corpusPath = resolve(
  process.cwd(),
  "../testing/fixtures/job-write/body.json",
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

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

  it("leaves the revision out of a whole-document write", () => {
    const write = jobWriteEnvelope(job(), null);

    expect(write).not.toHaveProperty("revision");
    expect(write.document).toEqual(corpus.job);
  });
});
