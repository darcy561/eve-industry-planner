import { describe, expect, it } from "vitest";
import {
  calculateInstallCostfromSetup,
  getJobInstallCostForPlanning,
  sumSetupEstimatedInstallCosts,
} from "../src/Functions/Installation Costs/installCosts.js";
import Job from "../src/Classes/job.js";

// The job helpers read what the installs cost through Job.totalInstallCost(), so
// these cases are real jobs rather than job-shaped literals.
function jobWith(build) {
  return new Job({ jobID: "job-1", itemID: 587, jobType: 1, build });
}

describe("installCosts", () => {
  it("sums estimatedInstallCost × jobCount per setup", () => {
    expect(
      sumSetupEstimatedInstallCosts({
        a: { estimatedInstallCost: 100, jobCount: 2 },
        b: { estimatedInstallCost: 50, jobCount: 1 },
      })
    ).toBe(250);
  });

  it("planning mode uses setup estimates when nothing is linked", () => {
    const job = jobWith({
      setup: { s1: { estimatedInstallCost: 80, jobCount: 3 } },
      costs: { linkedJobs: [] },
      products: { totalQuantity: 10 },
      materials: [],
    });
    expect(getJobInstallCostForPlanning(job)).toBe(240);
    expect(job.totalInstallCost()).toBe(0);
  });

  it("planning mode prefers actual when ESI jobs are linked", () => {
    const job = jobWith({
      setup: { s1: { estimatedInstallCost: 999, jobCount: 1 } },
      costs: { linkedJobs: [{ job_id: 1, cost: 42 }] },
      products: { totalQuantity: 1 },
      materials: [],
    });
    expect(getJobInstallCostForPlanning(job)).toBe(42);
    expect(job.totalInstallCost()).toBe(42);
  });

  it("actual mode returns zero when ESI linked but cost not yet recorded", () => {
    const job = jobWith({
      setup: { s1: { estimatedInstallCost: 500, jobCount: 1 } },
      costs: { linkedJobs: [{ job_id: 1, cost: 0 }] },
      products: { totalQuantity: 1 },
      materials: [],
    });
    expect(job.totalInstallCost()).toBe(0);
    expect(getJobInstallCostForPlanning(job)).toBe(0);
  });

  it("returns 0 from calculateInstallCostfromSetup for non-Setup input", () => {
    expect(calculateInstallCostfromSetup({})).toBe(0);
  });
});
