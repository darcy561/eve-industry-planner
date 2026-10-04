import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { jobWriteEnvelope } from "./jobWriteEnvelope.js";
import { toDocument } from "./jobDocument.js";
import { jobChangeRequestBody } from "../Endpoints/Private/jobDocuments.js";

const corpusPath = resolve(
  process.cwd(),
  "../testing/fixtures/job-write/body.json",
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

function job() {
  return structuredClone(corpus.job);
}

describe("the write envelope the corpus states", () => {
  it("is what a job and the reader's changes build", () => {
    expect(jobWriteEnvelope(job(), corpus.changes)).toEqual(corpus.write);
  });

  it("leaves the revision out of a whole-document write", () => {
    const built = job();
    const write = jobWriteEnvelope(built, null);

    expect(write).not.toHaveProperty("revision");
    expect(write.document).toEqual(toDocument(built));
  });
});

describe("the change the corpus states", () => {
  it("is the body a save sent as one change carries", () => {
    expect(jobChangeRequestBody([corpus.write])).toEqual(corpus.change);
  });
});
