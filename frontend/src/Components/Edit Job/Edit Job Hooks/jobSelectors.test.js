import { describe, expect, it } from "vitest";

import Job from "../../../Classes/job";
import {
  childJobIDs,
  childJobIDsAfterEdits,
  childJobsAfterEdits,
  materialIDs,
  materialRequirementOf,
  parentJobIDs,
  perItem,
  relatedJobIDs,
  selectedSetup,
  selectedSetupOf,
  setupSystemIDs,
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

// How much of a material a job calls for is every setup's requirement summed,
// which is what decides whether enough of it has been bought.
describe("what the setups call for of a material", () => {
  const setups = {
    "setup-1": { id: "setup-1", materialCount: { 34: { quantity: 100 } } },
    "setup-2": { id: "setup-2", materialCount: { 34: { quantity: 50 } } },
  };

  it("adds up what every setup asks for", () => {
    expect(materialRequirementOf(setups, 34)).toBe(150);
  });

  it("asks for none of a material no setup names", () => {
    expect(materialRequirementOf(setups, 35)).toBe(0);
  });

  it("asks for none where a setup carries no materials at all", () => {
    expect(materialRequirementOf({ "setup-1": {} }, 34)).toBe(0);
    expect(materialRequirementOf(undefined, 34)).toBe(0);
  });

  // A quantity stored as text still counts: what is stored has been through the
  // wire, and a NaN here would take the whole requirement with it.
  it("reads a quantity stored as text", () => {
    const stored = { "setup-1": { materialCount: { 34: { quantity: "40" } } } };

    expect(materialRequirementOf(stored, 34)).toBe(40);
  });
});

describe("the setup a reader has open, read off the setups alone", () => {
  const setups = { "setup-1": { id: "setup-1" }, "setup-2": { id: "setup-2" } };

  it("is the one named", () => {
    expect(selectedSetupOf(setups, "setup-2")).toBe(setups["setup-2"]);
  });

  it("is nothing where the name matches none, or there are none", () => {
    expect(selectedSetupOf(setups, "setup-9")).toBeUndefined();
    expect(selectedSetupOf(setups, undefined)).toBeUndefined();
    expect(selectedSetupOf(undefined, "setup-1")).toBeUndefined();
  });
});

// A job that makes nothing has no cost per item, and must not report one as
// Infinity or NaN: the panels hand this straight to the number formatter.
describe("a cost spread over what was produced", () => {
  it("divides the cost by the count", () => {
    expect(perItem(100, 4)).toBe(25);
  });

  it("is nothing where nothing was produced", () => {
    expect(perItem(100, 0)).toBe(0);
    expect(perItem(100, undefined)).toBe(0);
  });
});

describe("the jobs a job is linked to", () => {
  const linked = {
    parentJobs: ["parent-1"],
    build: { childJobs: { 34: ["child-1"], 35: [] } },
  };

  it("names its parents and its children", () => {
    expect(parentJobIDs(linked)).toEqual(["parent-1"]);
    expect(childJobIDs(linked)).toEqual(["child-1"]);
  });

  // A material with no child job against it contributes nothing rather than an
  // empty entry, and the two directions are one list, parents first.
  it("names both directions as one list", () => {
    expect(relatedJobIDs(linked)).toEqual(["parent-1", "child-1"]);
  });

  it("names none for a job that is linked to nothing", () => {
    expect(relatedJobIDs({})).toEqual([]);
    expect(relatedJobIDs(undefined)).toEqual([]);
  });
});

describe("the systems a job's setups build in", () => {
  it("names each once, however many setups share it", () => {
    const job = {
      build: {
        setup: {
          a: { id: "a", systemID: 30000142 },
          b: { id: "b", systemID: 30000142 },
          c: { id: "c", systemID: 30002187 },
        },
      },
    };

    expect(setupSystemIDs(job)).toEqual([30000142, 30002187]);
  });

  it("names none for a job with no setups", () => {
    expect(setupSystemIDs({ build: { setup: {} } })).toEqual([]);
    expect(setupSystemIDs(undefined)).toEqual([]);
  });
});

// Which types a job needs priced: what it makes, and what it is made from. A
// child job's type is a material of this job only where it happens to be one,
// so reading the child jobs left any other material unpriced.
describe("the types a job prices", () => {
  it("names what it makes first, then what it is made from", () => {
    const job = {
      itemID: 587,
      build: { materials: { 34: { typeID: 34 }, 35: { typeID: 35 } } },
    };

    expect(materialIDs(job)).toEqual([587, 34, 35]);
  });
});
