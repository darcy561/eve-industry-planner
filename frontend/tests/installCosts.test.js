import { describe, expect, it } from "vitest";
import {
  calculateInstallCostfromSetup,
  getJobActualInstallCost,
  getJobInstallCostForPlanning,
  sumSetupEstimatedInstallCosts,
} from "../src/Functions/Installation Costs/installCosts.js";

describe("installCosts", () => {
  it("sums estimatedInstallCost × jobCount per setup", () => {
    expect(
      sumSetupEstimatedInstallCosts({
        a: { estimatedInstallCost: 100, jobCount: 2 },
        b: { estimatedInstallCost: 50, jobCount: 1 },
      })
    ).toBe(250);
  });

  it("planning mode uses setup estimates when installCosts is default zero", () => {
    const job = {
      build: {
        setup: { s1: { estimatedInstallCost: 80, jobCount: 3 } },
        costs: { installCosts: 0, linkedJobs: [], extrasTotal: 0 },
        products: { totalQuantity: 10 },
        materials: [],
      },
    };
    expect(getJobInstallCostForPlanning(job)).toBe(240);
    expect(getJobActualInstallCost(job)).toBe(0);
  });

  it("planning mode prefers actual when ESI jobs are linked", () => {
    const job = {
      build: {
        setup: { s1: { estimatedInstallCost: 999, jobCount: 1 } },
        costs: {
          installCosts: 42,
          linkedJobs: [{ job_id: 1, cost: 42 }],
          extrasTotal: 0,
        },
        products: { totalQuantity: 1 },
        materials: [],
      },
    };
    expect(getJobInstallCostForPlanning(job)).toBe(42);
    expect(getJobActualInstallCost(job)).toBe(42);
  });

  it("actual mode returns zero when ESI linked but cost not yet recorded", () => {
    const job = {
      build: {
        setup: { s1: { estimatedInstallCost: 500, jobCount: 1 } },
        costs: {
          installCosts: 0,
          linkedJobs: [{ job_id: 1, cost: 0 }],
          extrasTotal: 0,
        },
        products: { totalQuantity: 1 },
        materials: [],
      },
    };
    expect(getJobActualInstallCost(job)).toBe(0);
    expect(getJobInstallCostForPlanning(job)).toBe(0);
  });

  it("returns 0 from calculateInstallCostfromSetup for non-Setup input", () => {
    expect(calculateInstallCostfromSetup({})).toBe(0);
  });
});
