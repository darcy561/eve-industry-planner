import { describe, expect, it, vi } from "vitest";
import {
  buildCost,
  buildCostPerItem,
  isReadyToBuild,
  totalBoughtMaterialCost,
  totalMaterialCost,
  totalQuantityProduced,
} from "../Components/Edit Job/Edit Job Hooks/jobSelectors.js";

vi.mock("../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock();
});

const { default: Job } = await import("./job.js");
const { default: Setup } = await import("./jobSetup.js");
const { distributeItemCostsBetweenJobs } =
  await import("../Functions/Shared/passBuildCosts.js");

const TRITANIUM = 34;
const PYERITE = 35;

function recipe() {
  return {
    jobType: 1,
    activities: {
      manufacturing: {
        materials: {
          [String(TRITANIUM)]: {
            typeID: TRITANIUM,
            name: "Tritanium",
            quantity: 100,
            volume: 0.01,
          },
          [String(PYERITE)]: {
            typeID: PYERITE,
            name: "Pyerite",
            quantity: 40,
            volume: 0.01,
          },
        },
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
  const job = new Job({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    name: "Rifter",
  });
  job.buildJobObject(recipe(), {});
  return job;
}

function materialOf(job, typeID) {
  return job.build.materials[String(typeID)];
}

describe("a job's materials through its life", () => {
  it("keeps every figure in step from first setup to archive-ready document", () => {
    const job = newJob();
    const tritanium = materialOf(job, TRITANIUM);

    expect(tritanium.quantity).toBe(0);
    expect(totalMaterialCost(job.toDocument())).toBe(0);
    expect(isReadyToBuild(job)).toBe(false);

    job.attachNewSetupToJob(
      setupFor("setup-1", {
        runCount: 10,
        jobCount: 1,
        tritanium: 100,
        pyerite: 40,
      }),
    );
    expect(tritanium.quantity).toBe(100);
    expect(totalQuantityProduced(job)).toBe(100);
    expect(tritanium.quantityRemaining).toBe(100);

    job.importPurchaseToMaterial(TRITANIUM, { itemCount: 60, itemCost: 5 });
    expect(tritanium.quantityPurchased).toBe(60);
    expect(tritanium.purchasedCost).toBe(300);
    expect(tritanium.purchaseComplete).toBe(false);
    expect(totalMaterialCost(job.toDocument())).toBe(300);
    expect(buildCost(job)).toBe(300);
    expect(isReadyToBuild(job)).toBe(false);

    const { taken, leftOver } = job.importPurchaseToMaterial(
      TRITANIUM,
      { itemCount: 60, itemCost: 8 },
      { recordExcess: true },
    );
    expect({ taken, leftOver }).toEqual({ taken: 40, leftOver: 20 });
    expect(tritanium.quantityImported).toBe(120);
    expect(tritanium.quantityPurchased).toBe(100);
    expect(tritanium.excessQuantity).toBe(20);
    expect(tritanium.purchasedCost).toBe(620);
    expect(tritanium.purchaseComplete).toBe(true);

    expect(isReadyToBuild(job)).toBe(false);
    job.importPurchaseToMaterial(PYERITE, { itemCount: 40, itemCost: 2 });
    expect(isReadyToBuild(job)).toBe(true);
    expect(totalMaterialCost(job.toDocument())).toBe(700);

    job.attachNewSetupToJob(
      setupFor("setup-2", {
        runCount: 5,
        jobCount: 1,
        tritanium: 50,
        pyerite: 20,
      }),
    );
    expect(tritanium.quantity).toBe(150);
    expect(totalQuantityProduced(job)).toBe(150);
    expect(tritanium.purchaseComplete).toBe(false);
    expect(tritanium.quantityRemaining).toBe(30);
    expect(tritanium.excessQuantity).toBe(0);

    expect(tritanium.purchasedCost).toBe(780);
    expect(isReadyToBuild(job)).toBe(false);

    delete job.build.setup["setup-2"];
    expect(tritanium.quantity).toBe(100);
    expect(tritanium.purchasedCost).toBe(620);
    expect(tritanium.excessQuantity).toBe(20);
    expect(isReadyToBuild(job)).toBe(true);

    expect(totalMaterialCost(job.toDocument())).toBe(700);
    expect(buildCost(job)).toBe(700);
    expect(buildCostPerItem(job)).toBe(7);

    const reloaded = new Job(job.toDocument());
    const reloadedTritanium = materialOf(reloaded, TRITANIUM);
    expect(reloadedTritanium.quantity).toBe(100);
    expect(reloadedTritanium.quantityPurchased).toBe(100);
    expect(reloadedTritanium.purchasedCost).toBe(620);
    expect(reloadedTritanium.excessQuantity).toBe(20);
    expect(totalMaterialCost(reloaded.toDocument())).toBe(700);
    expect(buildCostPerItem(reloaded)).toBe(7);
  });

  it("keeps a child job's output apart from what was bought", () => {
    const parent = newJob();
    parent.attachNewSetupToJob(
      setupFor("setup-1", {
        runCount: 10,
        jobCount: 1,
        tritanium: 100,
        pyerite: 40,
      }),
    );
    parent.build.childJobs[TRITANIUM] = ["child-1"];

    parent.importPurchaseToMaterial(TRITANIUM, { itemCount: 30, itemCost: 5 });

    const costs = [{ id: "child-1", cost: 4, quantity: 100 }];
    distributeItemCostsBetweenJobs(
      { [TRITANIUM]: { totalQuantity: 100, costs } },
      [parent],
      { [TRITANIUM]: new Set(["job-1"]) },
    );

    const tritanium = materialOf(parent, TRITANIUM);
    expect(costs[0].quantity).toBe(30);
    expect(tritanium.quantityPurchased).toBe(100);
    expect(tritanium.hasPurchaseFromChild("child-1")).toBe(true);

    expect(tritanium.purchasedCost).toBe(430);

    expect(tritanium.boughtCost).toBe(150);
    expect(totalBoughtMaterialCost(parent)).toBe(150);

    distributeItemCostsBetweenJobs(
      {
        [TRITANIUM]: {
          totalQuantity: 30,
          costs: [{ id: "child-1", cost: 4, quantity: 30 }],
        },
      },
      [parent],
      { [TRITANIUM]: new Set(["job-1"]) },
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
      }),
    );

    job.importPurchaseToMaterial(TRITANIUM, { itemCount: 60, itemCost: 5 });
    job.importPurchaseToMaterial(TRITANIUM, { itemCount: 40, itemCost: 9 });

    const tritanium = materialOf(job, TRITANIUM);
    const cheapest = Object.values(tritanium.purchasing).find(
      (row) => row.itemCost === 5,
    );
    expect(tritanium.purchasedCost).toBe(660);

    expect(tritanium.removePurchase(cheapest.id)).toBe(true);

    expect(tritanium.quantityPurchased).toBe(40);
    expect(tritanium.purchasedCost).toBe(360);
    expect(tritanium.purchaseComplete).toBe(false);
    expect(totalMaterialCost(job.toDocument())).toBe(360);
  });
});
