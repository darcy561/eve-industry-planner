import { describe, expect, it, vi } from "vitest";

const store = { jobs: new Map() };

vi.mock("../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      jobData: {
        jobArray: [...store.jobs.values()],
        actions: { findJobInJobArray: (id) => store.jobs.get(id) ?? null },
      },
    }),
  );
});

const { childJobSupplyForMaterial } =
  await import("../Components/Edit Job/Edit Job Components/Purchasing/Standard Layout/Material Cards/functions/childJobSupplyForMaterial.js");
const { jobFromDocument } =
  await import("../Functions/JobDocuments/jobDocument.js");
const { applyCommands, importPurchaseToMaterial } =
  await import("../Components/Edit Job/Edit Job Hooks/jobCommands.js");
const { materialRequirementOf } =
  await import("../Components/Edit Job/Edit Job Hooks/jobSelectors.js");
const { quantityRemaining } =
  await import("../Components/Edit Job/Edit Job Hooks/materialSelectors.js");

const TRITANIUM = 34;

function parent(jobID, needs, childIDs = []) {
  const job = jobFromDocument({
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
          materialCount: {
            [TRITANIUM]: { typeID: TRITANIUM, quantity: needs },
          },
        },
      },
      materials: {
        [String(TRITANIUM)]: { typeID: TRITANIUM, name: "Tritanium" },
      },
      childJobs: { [TRITANIUM]: childIDs },
    },
  });
  return job;
}

function child(jobID, produces, parentJobs) {
  return jobFromDocument({
    jobID,
    itemID: TRITANIUM,
    jobType: 1,
    itemsProducedPerRun: produces,
    parentJobs,
    build: {
      setup: { "setup-1": { id: "setup-1", runCount: 1, jobCount: 1 } },
      materials: {},
    },
  });
}

function supplyFor(job, childJob) {
  const material = job.build.materials[TRITANIUM];
  return childJobSupplyForMaterial(
    job.jobID,
    material,
    quantityRemaining(
      material,
      materialRequirementOf(job.build.setup, TRITANIUM),
    ),
    [childJob],
  );
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

    applyCommands(
      second,
      importPurchaseToMaterial(
        TRITANIUM,
        {
          id: "buy-1",
          itemCount: 600,
          itemCost: 5,
          childID: "child-1",
        },
        {
          availableToBuy: materialRequirementOf(second.build.setup, TRITANIUM),
        },
      ),
    );

    const supply = supplyFor(first, childJob);

    expect(supply.supply).toBe(400);
    expect(supply.min).toBe(400);
    expect(supply.max).toBe(400);
    expect(supply.coversEveryClaim).toBe(false);
  });

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

    const ownMaterial = first.build.materials[TRITANIUM];
    const supply = childJobSupplyForMaterial(
      first.jobID,
      ownMaterial,
      quantityRemaining(
        ownMaterial,
        materialRequirementOf(first.build.setup, TRITANIUM),
      ),
      [childA, childB],
    );

    expect(supply.supply).toBe(1400);
    expect(supply.sharedWith).toBe(1);
    expect(supply.min).toBe(1000);
    expect(supply.coversEveryClaim).toBe(true);
  });

  it("counts what this job has taken even when the child does not name it", () => {
    const job = parent("parent-1", 1000, ["child-1"]);
    const childJob = child("child-1", 1000, []);
    store.jobs = new Map([
      ["parent-1", job],
      ["child-1", childJob],
    ]);

    applyCommands(
      job,
      importPurchaseToMaterial(
        TRITANIUM,
        {
          id: "buy-1",
          itemCount: 600,
          itemCost: 5,
          childID: "child-1",
        },
        {
          availableToBuy: materialRequirementOf(job.build.setup, TRITANIUM),
        },
      ),
    );

    const supply = supplyFor(job, childJob);

    expect(supply.supply).toBe(400);
    expect(supply.max).toBe(400);
  });

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
