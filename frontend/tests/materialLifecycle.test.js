import { describe, expect, it, vi } from "vitest";

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", isLoggedIn: false },
      jobData: { jobArray: [], actions: {} },
    }),
  },
}));

const { default: Job } = await import("../src/Classes/job.js");
const { default: Setup } = await import("../src/Classes/jobSetup.js");
const { distributeItemCostsBetweenJobs } = await import(
  "../src/Functions/Shared/passBuildCosts.js"
);

// A job walked through the stages a real one goes through, asserting the whole
// chain each time: a setup says what a material needs, the job sums its setups,
// the material counts its purchases against that, and every cost above it
// follows. Nothing here reaches into a field the model derives.
const TRITANIUM = 34;
const PYERITE = 35;

function recipe() {
  return {
    jobType: 1,
    activities: {
      manufacturing: {
        materials: [
          { typeID: TRITANIUM, name: "Tritanium", quantity: 100, volume: 0.01 },
          { typeID: PYERITE, name: "Pyerite", quantity: 40, volume: 0.01 },
        ],
        products: [{ typeID: 587, quantity: 10 }],
        time: 600,
        skills: [],
      },
    },
  };
}

function setupFor(id, { runCount, jobCount, tritanium, pyerite }) {
  return new Setup({
    id,
    jobType: 1,
    runCount,
    jobCount,
    materialCount: {
      [TRITANIUM]: { typeID: TRITANIUM, quantity: tritanium },
      [PYERITE]: { typeID: PYERITE, quantity: pyerite },
    },
  });
}

function newJob() {
  const job = new Job({ jobID: "job-1", itemID: 587, jobType: 1, name: "Rifter" });
  job.buildJobObject(recipe(), {});
  return job;
}

function materialOf(job, typeID) {
  return job.build.materials.find((material) => material.typeID === typeID);
}

describe("a job's materials through its life", () => {
  it("keeps every figure in step from first setup to archive-ready document", () => {
    const job = newJob();
    const tritanium = materialOf(job, TRITANIUM);

    // Before a setup exists the job asks for nothing, and a material with no
    // requirement is not "complete" work waiting to be built.
    expect(tritanium.quantity).toBe(0);
    expect(job.totalMaterialCost()).toBe(0);
    expect(job.isReadyToBuild()).toBe(false);

    // One setup: ten runs of ten, so 100 Tritanium and 40 Pyerite.
    job.attachNewSetupToJob(
      setupFor("setup-1", {
        runCount: 10,
        jobCount: 1,
        tritanium: 100,
        pyerite: 40,
      })
    );
    expect(tritanium.quantity).toBe(100);
    expect(job.totalQuantityProduced()).toBe(100);
    expect(tritanium.quantityStillRequired()).toBe(100);

    // Buying part of it moves the cost and nothing else.
    job.importPurchaseToMaterial(TRITANIUM, { itemCount: 60, itemCost: 5 });
    expect(tritanium.quantityPurchased).toBe(60);
    expect(tritanium.purchasedCost).toBe(300);
    expect(tritanium.purchaseComplete).toBe(false);
    expect(job.totalMaterialCost()).toBe(300);
    expect(job.buildCost()).toBe(300);
    expect(job.isReadyToBuild()).toBe(false);

    // Buying past the requirement is recorded but not charged.
    const { taken, leftOver } = job.importPurchaseToMaterial(
      TRITANIUM,
      { itemCount: 60, itemCost: 8 },
      { recordExcess: true }
    );
    expect({ taken, leftOver }).toEqual({ taken: 40, leftOver: 20 });
    expect(tritanium.quantityImported).toBe(120);
    expect(tritanium.quantityPurchased).toBe(100);
    expect(tritanium.excessQuantity).toBe(20);
    expect(tritanium.purchasedCost).toBe(620);
    expect(tritanium.purchaseComplete).toBe(true);

    // The other material still holds the job back.
    expect(job.isReadyToBuild()).toBe(false);
    job.importPurchaseToMaterial(PYERITE, { itemCount: 40, itemCost: 2 });
    expect(job.isReadyToBuild()).toBe(true);
    expect(job.totalMaterialCost()).toBe(700);

    // A second setup asks for more of everything, and every figure follows it
    // without anything being recalculated.
    job.attachNewSetupToJob(
      setupFor("setup-2", {
        runCount: 5,
        jobCount: 1,
        tritanium: 50,
        pyerite: 20,
      })
    );
    expect(tritanium.quantity).toBe(150);
    expect(job.totalQuantityProduced()).toBe(150);
    expect(tritanium.purchaseComplete).toBe(false);
    expect(tritanium.quantityStillRequired()).toBe(30);
    expect(tritanium.excessQuantity).toBe(0);
    // The 20 that were excess now count, at the price they were bought for.
    expect(tritanium.purchasedCost).toBe(780);
    expect(job.isReadyToBuild()).toBe(false);

    // Dropping a setup takes the requirement back down, and the dearest units
    // are the ones that stop counting.
    job.layout.setupToEdit = "setup-2";
    expect(job.deleteActiveSetup()).toBe(true);
    expect(tritanium.quantity).toBe(100);
    expect(tritanium.purchasedCost).toBe(620);
    expect(tritanium.excessQuantity).toBe(20);
    expect(job.isReadyToBuild()).toBe(true);

    // What the job cost, per item, is the sum of the parts over what it makes.
    expect(job.totalMaterialCost()).toBe(700);
    expect(job.buildCost()).toBe(700);
    expect(job.buildCostPerItem()).toBe(7);

    // A saved job comes back the same, figures and all.
    const reloaded = new Job(job.toDocument());
    const reloadedTritanium = materialOf(reloaded, TRITANIUM);
    expect(reloadedTritanium.quantity).toBe(100);
    expect(reloadedTritanium.quantityPurchased).toBe(100);
    expect(reloadedTritanium.purchasedCost).toBe(620);
    expect(reloadedTritanium.excessQuantity).toBe(20);
    expect(reloaded.totalMaterialCost()).toBe(700);
    expect(reloaded.buildCostPerItem()).toBe(7);
  });

  it("keeps a child job's output apart from what was bought", () => {
    const parent = newJob();
    parent.attachNewSetupToJob(
      setupFor("setup-1", {
        runCount: 10,
        jobCount: 1,
        tritanium: 100,
        pyerite: 40,
      })
    );
    parent.build.childJobs[TRITANIUM] = ["child-1"];

    parent.importPurchaseToMaterial(TRITANIUM, { itemCount: 30, itemCost: 5 });

    // The child produced 100 but the parent only needs 70 more, so the rest is
    // left on the entry for whoever needs it next.
    const costs = [{ id: "child-1", cost: 4, quantity: 100 }];
    distributeItemCostsBetweenJobs(
      { [TRITANIUM]: { totalQuantity: 100, costs } },
      [parent],
      { [TRITANIUM]: new Set(["job-1"]) }
    );

    const tritanium = materialOf(parent, TRITANIUM);
    expect(costs[0].quantity).toBe(30);
    expect(tritanium.quantityPurchased).toBe(100);
    expect(tritanium.hasPurchaseFromChild("child-1")).toBe(true);

    // Cheapest first: the child's 70 at 4 count before the 30 bought at 5.
    expect(tritanium.purchasedCost).toBe(430);
    // Only what was bought is a spend of this job's.
    expect(tritanium.boughtCost).toBe(150);
    expect(parent.totalBoughtMaterialCost()).toBe(150);

    // Re-running the import does not charge the same output twice.
    distributeItemCostsBetweenJobs(
      { [TRITANIUM]: { totalQuantity: 30, costs: [{ id: "child-1", cost: 4, quantity: 30 }] } },
      [parent],
      { [TRITANIUM]: new Set(["job-1"]) }
    );
    expect(tritanium.purchasedCost).toBe(430);
  });

  it("recounts what is left when a purchase is removed", () => {
    const job = newJob();
    job.attachNewSetupToJob(
      setupFor("setup-1", {
        runCount: 10,
        jobCount: 1,
        tritanium: 100,
        pyerite: 40,
      })
    );

    job.importPurchaseToMaterial(TRITANIUM, { itemCount: 60, itemCost: 5 });
    job.importPurchaseToMaterial(TRITANIUM, { itemCount: 40, itemCost: 9 });

    const tritanium = materialOf(job, TRITANIUM);
    const cheapest = tritanium.purchasing.find((row) => row.itemCost === 5);
    expect(tritanium.purchasedCost).toBe(660);

    expect(job.removeMaterialPurchase(TRITANIUM, cheapest.id)).toBe(true);

    expect(tritanium.quantityPurchased).toBe(40);
    expect(tritanium.purchasedCost).toBe(360);
    expect(tritanium.purchaseComplete).toBe(false);
    expect(job.totalMaterialCost()).toBe(360);
  });
});
