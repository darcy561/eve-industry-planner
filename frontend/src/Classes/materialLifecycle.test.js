import { describe, expect, it, vi } from "vitest";
import {
  buildCost,
  buildCostPerItem,
  isReadyToBuild,
  materialRequirementOf,
  totalBoughtMaterialCost,
  totalMaterialCost,
  totalQuantityProduced,
} from "../Components/Edit Job/Edit Job Hooks/jobSelectors.js";

vi.mock("../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock();
});

const { applyRecipeToJob, jobFromDocument, toDocument } =
  await import("../Functions/JobDocuments/jobDocument.js");
const {
  applyCommands,
  attachNewSetupToJob,
  importPurchaseToMaterial,
  importedQuantities,
} = await import("../Components/Edit Job/Edit Job Hooks/jobCommands.js");
const {
  boughtCost,
  excessQuantity,
  purchaseComplete,
  purchasedCost,
  quantityImported,
  quantityPurchased,
  quantityRemaining,
} = await import("../Components/Edit Job/Edit Job Hooks/materialSelectors.js");
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
  const job = jobFromDocument({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    name: "Rifter",
  });
  applyRecipeToJob(job, recipe(), {});
  return job;
}

function materialOf(job, typeID) {
  return job.build.materials[String(typeID)];
}

function need(job, typeID) {
  return materialRequirementOf(job.build.setup, typeID);
}

function attach(job, setup) {
  applyCommands(job, attachNewSetupToJob(setup));
}

function buy(job, typeID, purchase, options = {}) {
  const requirement = need(job, typeID);
  const material = materialOf(job, typeID);
  const availableToBuy =
    options.availableToBuy ?? quantityRemaining(material, requirement);
  applyCommands(
    job,
    importPurchaseToMaterial(
      typeID,
      { id: crypto.randomUUID(), ...purchase },
      { ...options, availableToBuy },
    ),
  );
  return importedQuantities(purchase, availableToBuy);
}

describe("a job's materials through its life", () => {
  it("keeps every figure in step from first setup to archive-ready document", () => {
    const job = newJob();
    const tritanium = materialOf(job, TRITANIUM);

    expect(need(job, TRITANIUM)).toBe(0);
    expect(totalMaterialCost(toDocument(job))).toBe(0);
    expect(isReadyToBuild(job)).toBe(false);

    attach(
      job,
      setupFor("setup-1", {
        runCount: 10,
        jobCount: 1,
        tritanium: 100,
        pyerite: 40,
      }),
    );
    expect(need(job, TRITANIUM)).toBe(100);
    expect(totalQuantityProduced(job)).toBe(100);
    expect(quantityRemaining(tritanium, need(job, TRITANIUM))).toBe(100);

    buy(job, TRITANIUM, { itemCount: 60, itemCost: 5 });
    expect(quantityPurchased(tritanium, need(job, TRITANIUM))).toBe(60);
    expect(purchasedCost(tritanium, need(job, TRITANIUM))).toBe(300);
    expect(purchaseComplete(tritanium, need(job, TRITANIUM))).toBe(false);
    expect(totalMaterialCost(toDocument(job))).toBe(300);
    expect(buildCost(job)).toBe(300);
    expect(isReadyToBuild(job)).toBe(false);

    const { taken, leftOver } = buy(
      job,
      TRITANIUM,
      { itemCount: 60, itemCost: 8 },
      { recordExcess: true },
    );
    expect({ taken, leftOver }).toEqual({ taken: 40, leftOver: 20 });
    expect(quantityImported(tritanium)).toBe(120);
    expect(quantityPurchased(tritanium, need(job, TRITANIUM))).toBe(100);
    expect(excessQuantity(tritanium, need(job, TRITANIUM))).toBe(20);
    expect(purchasedCost(tritanium, need(job, TRITANIUM))).toBe(620);
    expect(purchaseComplete(tritanium, need(job, TRITANIUM))).toBe(true);

    expect(isReadyToBuild(job)).toBe(false);
    buy(job, PYERITE, { itemCount: 40, itemCost: 2 });
    expect(isReadyToBuild(job)).toBe(true);
    expect(totalMaterialCost(toDocument(job))).toBe(700);

    attach(
      job,
      setupFor("setup-2", {
        runCount: 5,
        jobCount: 1,
        tritanium: 50,
        pyerite: 20,
      }),
    );
    expect(need(job, TRITANIUM)).toBe(150);
    expect(totalQuantityProduced(job)).toBe(150);
    expect(purchaseComplete(tritanium, need(job, TRITANIUM))).toBe(false);
    expect(quantityRemaining(tritanium, need(job, TRITANIUM))).toBe(30);
    expect(excessQuantity(tritanium, need(job, TRITANIUM))).toBe(0);

    expect(purchasedCost(tritanium, need(job, TRITANIUM))).toBe(780);
    expect(isReadyToBuild(job)).toBe(false);

    delete job.build.setup["setup-2"];
    expect(need(job, TRITANIUM)).toBe(100);
    expect(purchasedCost(tritanium, need(job, TRITANIUM))).toBe(620);
    expect(excessQuantity(tritanium, need(job, TRITANIUM))).toBe(20);
    expect(isReadyToBuild(job)).toBe(true);

    expect(totalMaterialCost(toDocument(job))).toBe(700);
    expect(buildCost(job)).toBe(700);
    expect(buildCostPerItem(job)).toBe(7);

    const reloaded = jobFromDocument(toDocument(job));
    const reloadedTritanium = materialOf(reloaded, TRITANIUM);
    expect(need(reloaded, TRITANIUM)).toBe(100);
    expect(
      quantityPurchased(reloadedTritanium, need(reloaded, TRITANIUM)),
    ).toBe(100);
    expect(purchasedCost(reloadedTritanium, need(reloaded, TRITANIUM))).toBe(
      620,
    );
    expect(excessQuantity(reloadedTritanium, need(reloaded, TRITANIUM))).toBe(
      20,
    );
    expect(totalMaterialCost(toDocument(reloaded))).toBe(700);
    expect(buildCostPerItem(reloaded)).toBe(7);
  });

  it("keeps a child job's output apart from what was bought", () => {
    const parent = newJob();
    attach(
      parent,
      setupFor("setup-1", {
        runCount: 10,
        jobCount: 1,
        tritanium: 100,
        pyerite: 40,
      }),
    );
    parent.build.childJobs[TRITANIUM] = ["child-1"];

    buy(parent, TRITANIUM, { itemCount: 30, itemCost: 5 });

    const costs = [{ id: "child-1", cost: 4, quantity: 100 }];
    distributeItemCostsBetweenJobs(
      { [TRITANIUM]: { totalQuantity: 100, costs } },
      [parent],
      { [TRITANIUM]: new Set(["job-1"]) },
    );

    const tritanium = materialOf(parent, TRITANIUM);
    expect(costs[0].quantity).toBe(30);
    expect(quantityPurchased(tritanium, need(parent, TRITANIUM))).toBe(100);
    expect(
      Object.values(tritanium.purchasing).some((p) => p.childID === "child-1"),
    ).toBe(true);

    expect(purchasedCost(tritanium, need(parent, TRITANIUM))).toBe(430);

    expect(boughtCost(tritanium)).toBe(150);
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
    expect(purchasedCost(tritanium, need(parent, TRITANIUM))).toBe(430);
  });

  it("recounts what is left when a purchase is removed", () => {
    const job = newJob();
    attach(
      job,
      setupFor("setup-1", {
        runCount: 10,
        jobCount: 1,
        tritanium: 100,
        pyerite: 40,
      }),
    );

    buy(job, TRITANIUM, { itemCount: 60, itemCost: 5 });
    buy(job, TRITANIUM, { itemCount: 40, itemCost: 9 });

    const tritanium = materialOf(job, TRITANIUM);
    const cheapest = Object.values(tritanium.purchasing).find(
      (row) => row.itemCost === 5,
    );
    expect(purchasedCost(tritanium, need(job, TRITANIUM))).toBe(660);

    expect(cheapest.id in tritanium.purchasing).toBe(true);
    delete tritanium.purchasing[cheapest.id];

    expect(quantityPurchased(tritanium, need(job, TRITANIUM))).toBe(40);
    expect(purchasedCost(tritanium, need(job, TRITANIUM))).toBe(360);
    expect(purchaseComplete(tritanium, need(job, TRITANIUM))).toBe(false);
    expect(totalMaterialCost(toDocument(job))).toBe(360);
  });
});
