import { jobMaking } from "../../tests/editJobFixtures";
import { describe, expect, it, vi } from "vitest";

vi.mock("./estimatedMaterialCost.js", () => ({
  estimatedMaterialCost: (material) => material.cost ?? 0,
}));
vi.mock("../Installation Costs/installCosts.js", () => ({
  getJobInstallCostForPlanning: (job) => job?.installCost ?? 0,
}));

const { calculateChildJobTotals } = await import("./childJobTotals.js");

const childJob = ({ materials = [], installCost = 0, produced = 10 } = {}) =>
  jobMaking(produced, {
    installCost,
    build: { materials, childJobs: {} },
  });

describe("what a child job costs", () => {
  it("adds every material it needs", () => {
    const job = childJob({
      materials: {
        [String(34)]: { typeID: 34, cost: 300 },
        [String(35)]: { typeID: 35, cost: 700 },
      },
    });

    expect(calculateChildJobTotals(job).totalCostOfMaterials).toBe(1000);
  });

  it("counts the install cost separately from the materials", () => {
    const job = childJob({
      materials: { [String(34)]: { typeID: 34, cost: 300 } },
      installCost: 50,
    });
    const totals = calculateChildJobTotals(job);

    expect(totals.totalCostOfMaterials).toBe(300);
    expect(totals.totalInstallCosts).toBe(50);
  });

  it("divides the whole cost by what the job makes", () => {
    const job = childJob({
      materials: { [String(34)]: { typeID: 34, cost: 900 } },
      installCost: 100,
      produced: 10,
    });

    expect(calculateChildJobTotals(job).totalCostPerItem).toBe(100);
  });

  it("has no per-unit cost for a job that produces nothing", () => {
    // Dividing anyway gives an infinite cost, which would colour every
    // comparison against it.
    const job = childJob({
      materials: { [String(34)]: { typeID: 34, cost: 900 } },
      produced: 0,
    });

    expect(calculateChildJobTotals(job).totalCostPerItem).toBe(0);
  });

  it("costs nothing for a job that is not there yet", () => {
    expect(calculateChildJobTotals(undefined)).toMatchObject({
      totalCostOfMaterials: 0,
      quantityProduced: 0,
      totalCostPerItem: 0,
    });
  });
});
