import { describe, expect, it, vi } from "vitest";

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock({ account: { accountID: "clone-account" } });
});

const { jobFromDocument, toDocument } =
  await import("../Functions/Job/jobDocument.js");
const { addChildJob, applyCommands, removeChildJob, removeParentJob } =
  await import("../Components/Edit Job/Edit Job Hooks/jobCommands.js");

const TRITANIUM = 34;

function jobWithAChild() {
  return jobFromDocument({
    jobID: "parent",
    itemID: 587,
    parentJobs: ["grandparent"],
    build: {
      materials: { [TRITANIUM]: { typeID: TRITANIUM, name: "Tritanium" } },
      childJobs: { [TRITANIUM]: ["child-1", "child-2"] },
    },
  });
}

describe("a job copied through its document", () => {
  it("does not share its child job lists with the job it came from", () => {
    const source = jobWithAChild();
    const copy = jobFromDocument(toDocument(source));

    applyCommands(copy, removeChildJob(TRITANIUM, "child-1"));

    expect(copy.build.childJobs[TRITANIUM]).toEqual(["child-2"]);
    expect(source.build.childJobs[TRITANIUM]).toEqual(["child-1", "child-2"]);
  });

  it("does not share the collection the lists sit in", () => {
    const source = jobWithAChild();
    const copy = jobFromDocument(toDocument(source));

    applyCommands(copy, addChildJob(TRITANIUM, "child-3"));

    expect(copy.build.childJobs[TRITANIUM]).toContain("child-3");
    expect(source.build.childJobs[TRITANIUM]).not.toContain("child-3");
  });

  it("does not share its parent jobs", () => {
    const source = jobWithAChild();
    const copy = jobFromDocument(toDocument(source));

    applyCommands(copy, removeParentJob("grandparent"));

    expect(copy.parentJobs).toEqual([]);
    expect(source.parentJobs).toEqual(["grandparent"]);
  });

  it("does not change under a write once it has been built", () => {
    const job = jobWithAChild();
    const document = toDocument(job);

    applyCommands(job, removeChildJob(TRITANIUM, "child-1"));

    expect(document.build.childJobs[TRITANIUM]).toEqual(["child-1", "child-2"]);
  });
});
