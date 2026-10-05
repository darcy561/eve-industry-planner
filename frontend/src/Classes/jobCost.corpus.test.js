import {
  buildCost,
  totalExtrasCost,
  totalInstallCost,
  totalInventionCost,
  totalMaterialCost,
  totalQuantityProduced,
} from "../Components/Edit Job/Edit Job Hooks/jobSelectors.js";
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jobFromDocument } from "../Functions/Job/jobDocument";

const corpusPath = resolve(
  process.cwd(),
  "../testing/fixtures/job-cost/cases.json",
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

describe("job cost corpus", () => {
  test.for(corpus.cases)("$name", (testCase) => {
    const job = jobFromDocument(testCase.job);
    const { expected, why } = testCase;

    expect(totalQuantityProduced(job), why).toBe(expected.produced);
    expect(totalMaterialCost(job), why).toBe(expected.materials);
    expect(totalInstallCost(job), why).toBe(expected.install);
    expect(totalInventionCost(job), why).toBe(expected.invention);
    expect(totalExtrasCost(job), why).toBe(expected.extras);
    expect(buildCost(job), why).toBe(expected.build);
  });
});
