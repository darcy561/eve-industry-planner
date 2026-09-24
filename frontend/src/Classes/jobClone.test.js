import { describe, expect, it, vi } from "vitest";

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock({ account: { accountID: "clone-account" } });
});

const { default: Job } = await import("./job.js");

const TRITANIUM = 34;

/** A job with a child job linked to one of its materials. */
function jobWithAChild() {
  return new Job({
    jobID: "parent",
    itemID: 587,
    parentJobs: ["grandparent"],
    build: {
      materials: { [TRITANIUM]: { typeID: TRITANIUM, name: "Tritanium" } },
      childJobs: { [TRITANIUM]: ["child-1", "child-2"] },
    },
  });
}

/**
 * `new Job(source.toDocument())` is how this app copies a job it is about to
 * change — a merge, a delete, a move and a mass build all clone first and write
 * the clone, so the planner is left alone until the writes have landed. A copy
 * that shares anything with its source turns that into a change the planner
 * keeps whether the write succeeded or not.
 */
describe("a job copied through its document", () => {
  it("does not share its child job lists with the job it came from", () => {
    const source = jobWithAChild();
    const copy = new Job(source.toDocument());

    copy.removeChildJob(TRITANIUM, "child-1");

    expect(copy.build.childJobs[TRITANIUM]).toEqual(["child-2"]);
    expect(source.build.childJobs[TRITANIUM]).toEqual(["child-1", "child-2"]);
  });

  it("does not share the collection the lists sit in", () => {
    const source = jobWithAChild();
    const copy = new Job(source.toDocument());

    copy.addChildJob(TRITANIUM, "child-3");

    expect(copy.build.childJobs[TRITANIUM]).toContain("child-3");
    expect(source.build.childJobs[TRITANIUM]).not.toContain("child-3");
  });

  it("does not share its parent jobs", () => {
    const source = jobWithAChild();
    const copy = new Job(source.toDocument());

    copy.removeParentJob("grandparent");

    expect(copy.parentJobs).toEqual([]);
    expect(source.parentJobs).toEqual(["grandparent"]);
  });

  // The document is also what a write carries, and a save is built before it is
  // sent. A document holding the job's own lists would send whatever the job
  // held at the moment it was serialised rather than when it was built.
  it("does not change under a write once it has been built", () => {
    const job = jobWithAChild();
    const document = job.toDocument();

    job.removeChildJob(TRITANIUM, "child-1");

    expect(document.build.childJobs[TRITANIUM]).toEqual(["child-1", "child-2"]);
  });
});
