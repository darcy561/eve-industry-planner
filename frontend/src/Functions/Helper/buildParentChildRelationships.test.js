import { describe, expect, it, vi } from "vitest";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock();
});

const { default: buildParentChildRelationships } =
  await import("./buildParentChildRelationships.js");
const { jobFromDocument } = await import("../JobDocuments/jobDocument.js");

const TRITANIUM = 34;
const PYERITE = 35;

function job(jobID, itemID, materials = []) {
  return jobFromDocument({
    jobID,
    itemID,
    parentJobs: [],
    build: {
      materials: Object.fromEntries(
        materials.map((typeID) => [typeID, { typeID }]),
      ),
      childJobs: Object.fromEntries(materials.map((typeID) => [typeID, []])),
    },
  });
}

describe("linking jobs that feed each other", () => {
  it("hangs the maker of a material under the job that needs it", () => {
    const ship = job("ship", 587, [TRITANIUM]);
    const mineral = job("mineral", TRITANIUM);

    buildParentChildRelationships([ship, mineral]);

    expect(ship.build.childJobs[TRITANIUM]).toEqual(["mineral"]);
    expect(mineral.parentJobs).toEqual(["ship"]);
  });

  it("links every maker of the same material", () => {
    const ship = job("ship", 587, [TRITANIUM]);
    const first = job("first", TRITANIUM);
    const second = job("second", TRITANIUM);

    buildParentChildRelationships([ship, first, second]);

    expect(ship.build.childJobs[TRITANIUM].sort()).toEqual(["first", "second"]);
    expect(first.parentJobs).toEqual(["ship"]);
    expect(second.parentJobs).toEqual(["ship"]);
  });

  it("leaves a material nothing makes unlinked", () => {
    const ship = job("ship", 587, [TRITANIUM, PYERITE]);
    const mineral = job("mineral", TRITANIUM);

    buildParentChildRelationships([ship, mineral]);

    expect(ship.build.childJobs[PYERITE]).toEqual([]);
  });

  it("links nothing among jobs that do not feed each other", () => {
    const ship = job("ship", 587, [TRITANIUM]);
    const other = job("other", 588, [PYERITE]);

    buildParentChildRelationships([ship, other]);

    expect(ship.build.childJobs[TRITANIUM]).toEqual([]);
    expect(other.parentJobs).toEqual([]);
  });
});
