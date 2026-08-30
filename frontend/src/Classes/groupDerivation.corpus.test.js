import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Group from "./group.js";
import Job from "./job.js";

// The shared case file, read from the repo root rather than copied here: the
// backend (shared/groupshape) reads the same file, and a rule may not change on
// one side alone. Read by path rather than imported so it is not pulled through
// the bundler from outside the app root.
const corpusPath = resolve(
  process.cwd(),
  "../testing/fixtures/group-derivation/cases.json"
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

describe("group derivation corpus", () => {
  test.each(corpus.cases.map((c) => [c.name, c]))("%s", (_name, testCase) => {
    const jobs = testCase.jobs.map((document) => new Job(document));

    const group = new Group({ groupID: "group-1" });
    group.createGroup(jobs);
    const document = group.toDocument();

    const { expected } = testCase;
    expect(document.groupName, testCase.why).toBe(expected.groupName);
    expect(document.includedJobIDs).toEqual(expected.includedJobIDs);
    expect(document.includedTypeIDs).toEqual(expected.includedTypeIDs);
    expect(document.materialIDs).toEqual(expected.materialIDs);
    expect(document.outputJobCount, testCase.why).toBe(expected.outputJobCount);
    expect(document.linkedJobIDs).toEqual(expected.linkedJobIDs);
    expect(document.linkedOrderIDs).toEqual(expected.linkedOrderIDs);
    expect(document.linkedTransIDs).toEqual(expected.linkedTransIDs);
  });
});
