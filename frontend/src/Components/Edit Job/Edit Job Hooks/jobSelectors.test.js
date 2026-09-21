import { describe, expect, it } from "vitest";

import Job from "../../../Classes/job";
import {
  childJobIDsAfterEdits,
  childJobsAfterEdits,
  selectedSetup,
  setupToBuildFrom,
} from "./jobSelectors";

/**
 * Each selector is checked against the getter on `Job` it replaces: both read
 * the same job, and the answers are compared. The getter returns a `Setup` and
 * the selector returns the row, so the comparison is made on documents.
 */

const jobWith = (setup, setupToEdit) =>
  new Job({
    jobID: "job-1",
    name: "Job",
    itemID: 34,
    build: { setup },
    layout: { setupToEdit },
  });

const asDocument = (setup) =>
  setup && typeof setup.toDocument === "function" ? setup.toDocument() : setup;

const twoSetups = {
  "setup-1": { id: "setup-1", runCount: 1, jobCount: 1 },
  "setup-2": { id: "setup-2", runCount: 5, jobCount: 2 },
};

describe("the setup the reader has open", () => {
  it("is the one being edited, as the job says", () => {
    const job = jobWith(twoSetups, "setup-2");

    expect(selectedSetup(job.toDocument())).toEqual(
      asDocument(job.selectedSetup),
    );
    expect(selectedSetup(job.toDocument()).id).toBe("setup-2");
  });

  it("is nothing where the job names a setup it does not hold", () => {
    const job = jobWith(twoSetups, "setup-9");

    expect(selectedSetup(job.toDocument())).toBeUndefined();
    expect(job.selectedSetup).toBeUndefined();
  });

  it("is nothing where the job names none", () => {
    const job = jobWith(twoSetups, undefined);

    expect(selectedSetup(job.toDocument())).toBeUndefined();
    expect(job.selectedSetup).toBeUndefined();
  });

  it("is nothing for a job with no setups at all", () => {
    const job = jobWith({}, undefined);

    expect(selectedSetup(job.toDocument())).toBeUndefined();
    expect(job.selectedSetup).toBeUndefined();
  });
});

describe("the setup a new one continues from", () => {
  it("is the one open, as the job says", () => {
    const job = jobWith(twoSetups, "setup-2");

    expect(setupToBuildFrom(job.toDocument())).toEqual(
      asDocument(job.setupToBuildFrom),
    );
    expect(setupToBuildFrom(job.toDocument()).id).toBe("setup-2");
  });

  // A job always builds from something, so a reader who has closed the panel
  // still gets a setup to copy rather than the player's bare defaults.
  it("falls back to the first where none is open, as the job says", () => {
    const job = jobWith(twoSetups, undefined);

    expect(setupToBuildFrom(job.toDocument())).toEqual(
      asDocument(job.setupToBuildFrom),
    );
    expect(setupToBuildFrom(job.toDocument()).id).toBe("setup-1");
  });

  it("falls back where the job names a setup it does not hold", () => {
    const job = jobWith(twoSetups, "setup-9");

    expect(setupToBuildFrom(job.toDocument()).id).toBe("setup-1");
    expect(asDocument(job.setupToBuildFrom).id).toBe("setup-1");
  });

  it("is nothing for a job with no setups at all", () => {
    const job = jobWith({}, undefined);

    expect(setupToBuildFrom(job.toDocument())).toBeUndefined();
    expect(job.setupToBuildFrom).toBeUndefined();
  });
});

// A selector is handed plain data, which a draft is and a job part-way through
// loading may not be.
describe("a job that is not there yet", () => {
  it("answers nothing rather than throwing", () => {
    expect(selectedSetup(undefined)).toBeUndefined();
    expect(selectedSetup({})).toBeUndefined();
    expect(setupToBuildFrom(undefined)).toBeUndefined();
    expect(setupToBuildFrom({})).toBeUndefined();
  });
});

// One rule, read two ways: the screens that link a child job count one built
// but not yet saved, and the screens that only read what the job is made of do
// not. Both used to have their own copy of the fold.
describe("the child jobs a material counts", () => {
  const linked = ["job-a"];
  const temporary = { jobID: "job-temp" };

  it("takes what the job holds when nothing has been marked", () => {
    expect(childJobIDsAfterEdits(linked)).toEqual(["job-a"]);
    expect(childJobIDsAfterEdits(undefined)).toEqual([]);
  });

  it("counts a child marked for linking, and drops one marked for removal", () => {
    expect(
      childJobIDsAfterEdits(linked, { add: ["job-b"], remove: ["job-a"] }),
    ).toEqual(["job-b"]);
  });

  it("counts a child job built but not yet saved, where it is given one", () => {
    expect(childJobIDsAfterEdits(linked, undefined, temporary)).toEqual([
      "job-a",
      "job-temp",
    ]);
    expect(childJobIDsAfterEdits(linked, undefined)).toEqual(["job-a"]);
  });

  it("lets an unsaved child be taken off again", () => {
    expect(
      childJobIDsAfterEdits(linked, { remove: ["job-temp"] }, temporary),
    ).toEqual(["job-a"]);
  });

  it("names a job once however many ways it arrives", () => {
    expect(
      childJobIDsAfterEdits(linked, { add: ["job-a"] }, { jobID: "job-a" }),
    ).toEqual(["job-a"]);
  });

  it("reads the same answer off a whole job", () => {
    const job = { build: { childJobs: { 34: linked } } };

    expect(childJobsAfterEdits(job, 34, { 34: { add: ["job-b"] } })).toEqual(
      childJobIDsAfterEdits(linked, { add: ["job-b"] }),
    );
  });
});
