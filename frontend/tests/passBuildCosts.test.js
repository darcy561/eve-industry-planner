import { describe, expect, it, vi } from "vitest";

const store = {
  jobs: new Map(),
};

vi.mock("../src/Functions/JobDocuments/saveJobsViaApi.js", () => ({
  saveJobsViaApi: async () => {},
}));

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", isLoggedIn: false },
      jobData: {
        jobArray: [...store.jobs.values()],
        actions: {
          findJobInJobArray: (id) => store.jobs.get(id) ?? null,
          jobsFromIdsOrObjects: async (input) =>
            (Array.isArray(input) ? input : [...input]).map((i) =>
              typeof i === "string" ? store.jobs.get(i) : i
            ),
          updateOrAddJobsToJobArray: () => {},
        },
      },
    }),
  },
}));

const { distributeItemCostsBetweenJobs, passBuildCostsToParentJobs } =
  await import("../src/Functions/Shared/passBuildCosts.js");
const { default: Job } = await import("../src/Classes/job.js");

// A child job producing `produced` units for `spend` ISK, so its build cost per
// item is `spend / produced`.
function childProducing(jobID, produced, spend) {
  return new Job({
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
  const job = new Job({
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
      materials: [{ typeID: 34, name: "Tritanium", quantity }],
      childJobs: { 34: ["child-1", "child-2"] },
    },
  });
  return job;
}

describe("collecting what the child jobs produced", () => {
  // Two child jobs of the same item that happen to cost the same per unit are
  // still two separate lots. Pooling them under one cost entry must carry both
  // lots' quantities, or the second job's output never reaches the parent.
  it("keeps the output of both children when their per-item cost matches", async () => {
    const parent = parentNeeding(100);
    const childA = childProducing("child-1", 50, 250);
    const childB = childProducing("child-2", 50, 250);
    store.jobs = new Map([
      ["parent-1", parent],
      ["child-1", childA],
      ["child-2", childB],
    ]);

    expect(childA.buildCostPerItem()).toBe(childB.buildCostPerItem());

    await passBuildCostsToParentJobs([childA, childB]);

    const material = parent.build.materials[0];
    expect(material.quantityPurchased).toBe(100);
    expect(material.purchasedCost).toBe(500);
  });
});

describe("importing child job costs into a parent", () => {
  // Two child jobs of the same item that happened to cost the same per unit are
  // still two separate lots of output. Pooling them under one cost entry must
  // not lose the second lot's quantity.
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

    const material = job.build.materials[0];
    expect(material.quantityPurchased).toBe(100);
    expect(material.purchasedCost).toBe(500);
    expect(material.purchaseComplete).toBe(true);
  });

  // What a child produces is taken first come: the parent takes what it still
  // needs and the rest of the lot stays available for the next parent.
  it("takes only what the parent still needs and leaves the rest", () => {
    const job = parentNeeding(30);
    const costs = [{ id: "child-1", cost: 5, quantity: 50 }];

    distributeItemCostsBetweenJobs(
      { 34: { totalQuantity: 50, costs } },
      [job],
      { 34: new Set(["parent-1"]) }
    );

    expect(job.build.materials[0].quantityPurchased).toBe(30);
    expect(costs[0].quantity).toBe(20);
  });
});
