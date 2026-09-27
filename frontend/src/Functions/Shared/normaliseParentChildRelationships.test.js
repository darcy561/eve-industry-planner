import { describe, expect, it, vi } from "vitest";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock();
});

const { default: normaliseParentChildRelationships } =
  await import("./normaliseParentChildRelationships.js");
const { jobFromDocument } = await import("../JobDocuments/jobDocument.js");

const TRITANIUM = 34;

function job({ jobID, itemID, parentJobs = [], materials = [], childJobs }) {
  return jobFromDocument({
    jobID,
    itemID,
    parentJobs,
    build: {
      materials: Object.fromEntries(
        materials.map((typeID) => [typeID, { typeID }]),
      ),
      childJobs: childJobs ?? Object.fromEntries(materials.map((t) => [t, []])),
    },
  });
}

describe("a link only one side of it names", () => {
  it("tells the parent about a child that names it", () => {
    const child = job({
      jobID: "child",
      itemID: TRITANIUM,
      parentJobs: ["parent"],
    });
    const parent = job({
      jobID: "parent",
      itemID: 587,
      materials: [TRITANIUM],
    });

    const modified = normaliseParentChildRelationships([parent, child]);

    expect(parent.build.childJobs[TRITANIUM]).toEqual(["child"]);
    expect(modified).toEqual(new Set(["parent"]));
  });

  it("tells the child about a parent that names it", () => {
    const child = job({ jobID: "child", itemID: TRITANIUM });
    const parent = job({
      jobID: "parent",
      itemID: 587,
      materials: [TRITANIUM],
      childJobs: { [TRITANIUM]: ["child"] },
    });

    const modified = normaliseParentChildRelationships([parent, child]);

    expect(child.parentJobs).toEqual(["parent"]);
    expect(modified).toEqual(new Set(["child"]));
  });
});

describe("a link that no longer makes sense", () => {
  it("drops a parent that does not build what the child makes", () => {
    const child = job({
      jobID: "child",
      itemID: TRITANIUM,
      parentJobs: ["parent"],
    });
    const parent = job({ jobID: "parent", itemID: 587, materials: [35] });

    const modified = normaliseParentChildRelationships([parent, child]);

    expect(child.parentJobs).toEqual([]);
    expect(modified).toEqual(new Set(["child"]));
  });

  it("drops a child listed under a material it does not make", () => {
    const child = job({
      jobID: "child",
      itemID: 35,
      parentJobs: ["parent"],
    });
    const parent = job({
      jobID: "parent",
      itemID: 587,
      materials: [TRITANIUM],
      childJobs: { [TRITANIUM]: ["child"] },
    });

    const modified = normaliseParentChildRelationships([parent, child]);

    expect(parent.build.childJobs[TRITANIUM]).toEqual([]);
    expect(child.parentJobs).toEqual([]);
    expect(modified).toEqual(new Set(["parent", "child"]));
  });
});

describe("a link to a job that is not here", () => {
  it("leaves it alone", () => {
    const child = job({
      jobID: "child",
      itemID: TRITANIUM,
      parentJobs: ["elsewhere"],
    });

    const modified = normaliseParentChildRelationships([child]);

    expect(child.parentJobs).toEqual(["elsewhere"]);
    expect(modified).toEqual(new Set());
  });

  it("changes nothing for no jobs at all", () => {
    expect(normaliseParentChildRelationships()).toEqual(new Set());
  });
});
