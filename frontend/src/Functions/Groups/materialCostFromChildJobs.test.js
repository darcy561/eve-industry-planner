import { describe, expect, it, vi } from "vitest";
import { calculateMaterialCostFromChildJobs } from "./materialCostFromChildJobs.js";
import Job from "../../Classes/job.js";

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock({
    worldData: { actions: { findMarketData: () => ({ jita: { sell: 1 } }) } },
  });
});

describe("calculateMaterialCostFromChildJobs install rollup", () => {
  it("includes child setup install estimates in material cost", () => {
    // The helper asks the job what it produces, so this is a real Job.
    const childJob = new Job({
      jobID: "child-1",
      itemID: 587,
      jobType: 1,
      itemsProducedPerRun: 5,
      build: {
        setup: {
          s1: { id: "s1", estimatedInstallCost: 100, runCount: 1, jobCount: 2 },
        },
        costs: { linkedJobs: [] },
        materials: [],
        childJobs: {},
      },
    });

    const material = { typeID: 34, quantity: 5, purchaseComplete: false };
    const cost = calculateMaterialCostFromChildJobs(
      material,
      ["child-1"],
      [childJob],
      {},
      "jita",
      "sell",
    );

    // install 200 + extras 0, per unit 20, × material qty 5 = 100
    expect(cost).toBe(100);
  });
});
