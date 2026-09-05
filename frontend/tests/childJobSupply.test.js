import { describe, expect, it, vi } from "vitest";

const store = { jobs: new Map() };

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", isLoggedIn: false },
      jobData: {
        jobArray: [...store.jobs.values()],
        actions: {
          findJobInJobArray: (id) => store.jobs.get(id) ?? null,
        },
      },
    }),
  },
}));

const { childJobSupplyForMaterial } = await import(
  "../src/Components/Edit Job/Edit Job Components/Purchasing/Standard Layout/Material Cards/functions/childJobSupplyForMaterial.js"
);
const { default: Job } = await import("../src/Classes/job.js");

const TRITANIUM = 34;

// A parent needing `needs` Tritanium, with `childIDs` linked to supply it.
function parent(jobID, needs, childIDs = []) {
  const job = new Job({
    jobID,
    itemID: 587,
    jobType: 1,
    itemsProducedPerRun: 1,
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: { [TRITANIUM]: { typeID: TRITANIUM, quantity: needs } },
        },
      },
      materials: [{ typeID: TRITANIUM, name: "Tritanium" }],
      childJobs: { [TRITANIUM]: childIDs },
    },
  });
  return job;
}

// A child job making `produces` Tritanium for the given parents.
function child(jobID, produces, parentJobs) {
  return new Job({
    jobID,
    itemID: TRITANIUM,
    jobType: 1,
    itemsProducedPerRun: produces,
    parentJobs,
    build: {
      setup: { "setup-1": { id: "setup-1", runCount: 1, jobCount: 1 } },
      materials: [],
    },
  });
}

function supplyFor(job, childJob) {
  return childJobSupplyForMaterial(job, job.build.materials[0], [childJob]);
}

describe("what a child job can be counted on to supply", () => {
  it("covers a single parent it out-produces", () => {
    const job = parent("parent-1", 100, ["child-1"]);
    const childJob = child("child-1", 150, ["parent-1"]);
    store.jobs = new Map([
      ["parent-1", job],
      ["child-1", childJob],
    ]);

    const supply = supplyFor(job, childJob);

    expect(supply.coversEveryClaim).toBe(true);
    expect(supply.min).toBe(100);
    expect(supply.max).toBe(100);
    expect(supply.sharedWith).toBe(0);
  });

  // The output is not promised to anyone, so neither parent may claim cover.
  it("promises nothing certain when two parents want more than it makes", () => {
    const first = parent("parent-1", 1000, ["child-1"]);
    const second = parent("parent-2", 1000, ["child-1"]);
    const childJob = child("child-1", 1000, ["parent-1", "parent-2"]);
    store.jobs = new Map([
      ["parent-1", first],
      ["parent-2", second],
      ["child-1", childJob],
    ]);

    const supply = supplyFor(first, childJob);

    expect(supply.coversEveryClaim).toBe(false);
    expect(supply.min).toBe(0);
    expect(supply.max).toBe(1000);
    expect(supply.sharedWith).toBe(1);
  });

  it("counts what another parent has already taken", () => {
    const first = parent("parent-1", 600, ["child-1"]);
    const second = parent("parent-2", 600, ["child-1"]);
    const childJob = child("child-1", 1000, ["parent-1", "parent-2"]);
    store.jobs = new Map([
      ["parent-1", first],
      ["parent-2", second],
      ["child-1", childJob],
    ]);

    second.importPurchaseToMaterial(TRITANIUM, {
      itemCount: 600,
      itemCost: 5,
      childID: "child-1",
    });

    const supply = supplyFor(first, childJob);

    // 400 of the child's output is left, and nobody else is waiting on it.
    expect(supply.supply).toBe(400);
    expect(supply.min).toBe(400);
    expect(supply.max).toBe(400);
    expect(supply.coversEveryClaim).toBe(false);
  });

  // Two children feeding the same pair of parents are one claim from each
  // parent, not one per child.
  it("counts each parent's claim once, however many children supply it", () => {
    const first = parent("parent-1", 1000, ["child-1", "child-2"]);
    const second = parent("parent-2", 400, ["child-1", "child-2"]);
    const childA = child("child-1", 700, ["parent-1", "parent-2"]);
    const childB = child("child-2", 700, ["parent-1", "parent-2"]);
    store.jobs = new Map([
      ["parent-1", first],
      ["parent-2", second],
      ["child-1", childA],
      ["child-2", childB],
    ]);

    const supply = childJobSupplyForMaterial(first, first.build.materials[0], [
      childA,
      childB,
    ]);

    // 1400 made, the other parent wants 400, so 1000 is certain for this one.
    expect(supply.supply).toBe(1400);
    expect(supply.sharedWith).toBe(1);
    expect(supply.min).toBe(1000);
    expect(supply.coversEveryClaim).toBe(true);
  });

  // A child linked from this job's side may not list it as a parent yet, and its
  // output must still not be counted twice.
  it("counts what this job has taken even when the child does not name it", () => {
    const job = parent("parent-1", 1000, ["child-1"]);
    const childJob = child("child-1", 1000, []);
    store.jobs = new Map([
      ["parent-1", job],
      ["child-1", childJob],
    ]);

    job.importPurchaseToMaterial(TRITANIUM, {
      itemCount: 600,
      itemCost: 5,
      childID: "child-1",
    });

    const supply = supplyFor(job, childJob);

    expect(supply.supply).toBe(400);
    expect(supply.max).toBe(400);
  });

  // A parent that is not open cannot be asked what it needs, so nothing may be
  // counted on rather than a figure being invented.
  it("counts on nothing when a parent is not loaded", () => {
    const job = parent("parent-1", 100, ["child-1"]);
    const childJob = child("child-1", 1000, ["parent-1", "parent-elsewhere"]);
    store.jobs = new Map([
      ["parent-1", job],
      ["child-1", childJob],
    ]);

    const supply = supplyFor(job, childJob);

    expect(supply.claimsKnown).toBe(false);
    expect(supply.min).toBe(0);
    expect(supply.coversEveryClaim).toBe(false);
    expect(supply.output).toBe(1000);
  });
});
