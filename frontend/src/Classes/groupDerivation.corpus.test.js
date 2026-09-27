import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Group from "./group.js";
import { jobFromDocument } from "../Functions/JobDocuments/jobDocument";

const corpusPath = resolve(
  process.cwd(),
  "../testing/fixtures/group-derivation/cases.json",
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

describe("group derivation corpus", () => {
  test.for(corpus.cases)("$name", (testCase) => {
    const jobs = testCase.jobs.map((document) => jobFromDocument(document));

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
