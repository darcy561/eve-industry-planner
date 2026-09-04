import { describe, expect, it, vi } from "vitest";

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1" },
      jobData: { jobArray: [], actions: {} },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  },
}));

const { closeAdjustmentSummary } = await import(
  "../src/Functions/JobPlanner/closeAdjustmentSummary.js"
);
const { default: Job } = await import("../src/Classes/job.js");

function job({ parents = [], children = [] } = {}) {
  return new Job({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    name: "Oxygen Fuel Block",
    parentJobs: parents,
    build: { childJobs: { 34: children } },
  });
}

describe("what closing a job reports", () => {
  it("says only that the job was updated when nothing was recalculated", () => {
    expect(closeAdjustmentSummary(job(), [])).toBe("Oxygen Fuel Block Updated");
  });

  // The quantity someone set by hand is replaced on the way out, so the figure
  // that was saved is the one worth naming.
  it("says what the job now makes and why", () => {
    const summary = closeAdjustmentSummary(job({ parents: ["parent-1"] }), [
      { jobID: "job-1", name: "Oxygen Fuel Block", before: 280, after: 3440 },
    ]);

    expect(summary).toBe(
      "Oxygen Fuel Block updated — now making 3,440 to cover its parent jobs"
    );
  });

  it("does not blame parents when the job has none", () => {
    const summary = closeAdjustmentSummary(job(), [
      { jobID: "job-1", name: "Oxygen Fuel Block", before: 100, after: 280 },
    ]);

    expect(summary).toBe("Oxygen Fuel Block updated — now making 280");
  });

  it("counts the parents and children that moved with it", () => {
    const summary = closeAdjustmentSummary(
      job({ parents: ["parent-1"], children: ["child-1", "child-2"] }),
      [
        { jobID: "job-1", name: "Oxygen Fuel Block", before: 280, after: 3440 },
        { jobID: "parent-1", name: "Parent", before: 10, after: 20 },
        { jobID: "child-1", name: "Child A", before: 1, after: 2 },
        { jobID: "child-2", name: "Child B", before: 1, after: 2 },
      ]
    );

    expect(summary).toBe(
      "Oxygen Fuel Block updated — now making 3,440 to cover its parent jobs, 1 parent job adjusted and 2 child jobs adjusted"
    );
  });

  it("reports the jobs around it even when it was left alone", () => {
    const summary = closeAdjustmentSummary(job({ children: ["child-1"] }), [
      { jobID: "child-1", name: "Child A", before: 100, after: 40 },
    ]);

    expect(summary).toBe("Oxygen Fuel Block updated — 1 child job adjusted");
  });

  it("calls anything further out a related job", () => {
    const summary = closeAdjustmentSummary(job(), [
      { jobID: "job-9", name: "Grandchild", before: 5, after: 9 },
    ]);

    expect(summary).toBe("Oxygen Fuel Block updated — 1 related job adjusted");
  });
});
