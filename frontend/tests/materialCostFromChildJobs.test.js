import { describe, expect, it, vi, beforeEach } from "vitest";
import { calculateMaterialCostFromChildJobs } from "../src/Functions/Groups/materialCostFromChildJobs.js";

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      jobData: { jobArray: [] },
      worldData: {
        actions: {
          findMarketData: () => ({ jita: { sell: 1 } }),
        },
      },
    }),
  },
}));

describe("calculateMaterialCostFromChildJobs install rollup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes child setup install estimates in material cost", () => {
    const childJob = {
      jobID: "child-1",
      build: {
        setup: { s1: { estimatedInstallCost: 100, jobCount: 2 } },
        costs: { installCosts: 0, linkedJobs: [], extrasTotal: 0 },
        products: { totalQuantity: 10 },
        materials: [],
        childJobs: {},
      },
    };

    const material = { typeID: 34, quantity: 5, purchaseComplete: false };
    const cost = calculateMaterialCostFromChildJobs(
      material,
      ["child-1"],
      [childJob],
      {},
      "jita",
      "sell"
    );

    // install 200 + extras 0, per unit 20, × material qty 5 = 100
    expect(cost).toBe(100);
  });
});
