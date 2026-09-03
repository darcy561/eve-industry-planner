import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Job from "./job.js";

// The shared case file, read from the repo root rather than copied here: the
// backend (models.Job.CostParts) reads the same file, and what a job cost may not
// change on one side alone.
const corpusPath = resolve(process.cwd(), "../testing/fixtures/job-cost/cases.json");
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

describe("job cost corpus", () => {
  test.for(corpus.cases)("$name", (testCase) => {
    const job = new Job(testCase.job);
    const { expected, why } = testCase;

    expect(job.totalQuantityProduced(), why).toBe(expected.produced);
    expect(job.totalMaterialCost(), why).toBe(expected.materials);
    expect(job.totalInstallCost(), why).toBe(expected.install);
    expect(job.totalInventionCost(), why).toBe(expected.invention);
    expect(job.totalExtrasCost(), why).toBe(expected.extras);
    expect(job.buildCost(), why).toBe(expected.build);
  });
});
