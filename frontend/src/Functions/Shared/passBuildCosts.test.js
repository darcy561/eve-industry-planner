import { describe, expect, it, vi } from "vitest";
import {
  buildCostPerItem,
  materialRequirementOf,
} from "../../Components/Edit Job/Edit Job Hooks/jobSelectors.js";
import {
  purchaseComplete,
  purchasedCost,
  quantityPurchased,
} from "../../Components/Edit Job/Edit Job Hooks/materialSelectors.js";

const store = {
  jobs: new Map(),
};

vi.mock("../JobDocuments/saveJobsViaApi.js", () => ({
  saveJobsViaApi: async () => {},
}));

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      jobData: {
        jobArray: [...store.jobs.values()],
        actions: {
          findJobInJobArray: (id) => store.jobs.get(id) ?? null,
          jobsFromIdsOrObjects: async (input) =>
            (Array.isArray(input) ? input : [...input]).map((i) =>
              typeof i === "string" ? store.jobs.get(i) : i,
            ),
        },
      },
    }),
  );
});

const { distributeItemCostsBetweenJobs, passBuildCostsToParentJobs } =
  await import("./passBuildCosts.js");
const { jobFromDocument } = await import("../JobDocuments/jobDocument.js");

function childProducing(jobID, produced, spend) {
  return jobFromDocument({
    jobID,
    itemID: 34,
    jobType: 1,
    itemsProducedPerRun: produced,
    parentJobs: ["parent-1"],
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: { 35: { typeID: 35, quantity: spend } },
        },
      },
      materials: [
        {
          typeID: 35,
          name: "Pyerite",
          quantity: spend,
          purchasing: [
            { id: `${jobID}-p1`, typeID: 35, itemCount: spend, itemCost: 1 },
          ],
        },
      ],
    },
  });
}

function parentNeeding(quantity) {
  const job = jobFromDocument({
    jobID: "parent-1",
    itemID: 587,
    jobType: 1,
    itemsProducedPerRun: 1,
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: { 34: { typeID: 34, quantity } },
        },
      },
      materials: { [String(34)]: { typeID: 34, name: "Tritanium", quantity } },
      childJobs: { 34: ["child-1", "child-2"] },
    },
  });
  return job;
}

describe("collecting what the child jobs produced", () => {
  it("keeps the output of both children when their per-item cost matches", async () => {
    const parent = parentNeeding(100);
    const childA = childProducing("child-1", 50, 250);
    const childB = childProducing("child-2", 50, 250);
    store.jobs = new Map([
      ["parent-1", parent],
      ["child-1", childA],
      ["child-2", childB],
    ]);

    expect(buildCostPerItem(childA)).toBe(buildCostPerItem(childB));

    await passBuildCostsToParentJobs([childA, childB]);

    const material = Object.values(parent.build.materials)[0];
    const requirement = materialRequirementOf(
      parent.build.setup,
      material.typeID,
    );
    expect(quantityPurchased(material, requirement)).toBe(100);
    expect(purchasedCost(material, requirement)).toBe(500);
  });
});

describe("importing child job costs into a parent", () => {
  it("imports the output of every child job at the same per-item cost", () => {
    const job = parentNeeding(100);
    const collectedMaterials = {
      34: {
        totalQuantity: 100,
        costs: [
          { id: "child-1", cost: 5, quantity: 50 },
          { id: "child-2", cost: 5, quantity: 50 },
        ],
      },
    };

    distributeItemCostsBetweenJobs(collectedMaterials, [job], {
      34: new Set(["parent-1"]),
    });

    const material = Object.values(job.build.materials)[0];
    const requirement = materialRequirementOf(job.build.setup, material.typeID);
    expect(quantityPurchased(material, requirement)).toBe(100);
    expect(purchasedCost(material, requirement)).toBe(500);
    expect(purchaseComplete(material, requirement)).toBe(true);
  });

  it("takes only what the parent still needs and leaves the rest", () => {
    const job = parentNeeding(30);
    const costs = [{ id: "child-1", cost: 5, quantity: 50 }];

    distributeItemCostsBetweenJobs(
      { 34: { totalQuantity: 50, costs } },
      [job],
      { 34: new Set(["parent-1"]) },
    );

    expect(
      quantityPurchased(
        Object.values(job.build.materials)[0],
        materialRequirementOf(
          job.build.setup,
          Object.values(job.build.materials)[0].typeID,
        ),
      ),
    ).toBe(30);
    expect(costs[0].quantity).toBe(20);
  });
});
