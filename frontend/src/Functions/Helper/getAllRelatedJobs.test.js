import { beforeEach, describe, expect, it, vi } from "vitest";

/** The planner's jobs, and which of them the store already holds. */
const planner = { jobs: {}, held: new Set() };
/** Every id `loadAllRelatedJobs` asked for, in the order it asked. */
let asked = [];

vi.mock("../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      jobData: {
        actions: {
          findJobInJobArray: (jobID) =>
            planner.held.has(jobID) ? planner.jobs[jobID] : null,
          jobsFromIdsOrObjects: async (jobIDs) => {
            asked.push(...jobIDs);
            // What the real action does: the store's own, plus whatever the API
            // answers for the rest.
            return jobIDs.map((jobID) => planner.jobs[jobID]).filter(Boolean);
          },
        },
      },
    }),
  },
}));

const { default: getAllRelatedJobs, loadAllRelatedJobs } =
  await import("./getAllRelatedJobs.js");

/**
 * @param {string} jobID
 * @param {string[]} children
 * @param {string[]} [parents]
 */
function job(jobID, children, parents = []) {
  planner.jobs[jobID] = {
    jobID,
    relatedJobIDs: [...parents, ...children],
  };
}

beforeEach(() => {
  planner.jobs = {};
  planner.held = new Set();
  asked = [];
});

describe("getAllRelatedJobs", () => {
  it("walks the chain through the jobs the store holds", () => {
    job("top", ["middle"]);
    job("middle", ["bottom"], ["top"]);
    job("bottom", [], ["middle"]);
    planner.held = new Set(["top", "middle", "bottom"]);

    expect(
      getAllRelatedJobs("top")
        .map((j) => j.jobID)
        .sort(),
    ).toEqual(["bottom", "middle", "top"]);
  });

  // The store is not obliged to hold a job the chain names, and the walk stops
  // where it cannot see — which is what `loadAllRelatedJobs` exists to fix.
  it("stops where the store holds nothing", () => {
    job("top", ["middle"]);
    job("middle", ["bottom"], ["top"]);
    job("bottom", [], ["middle"]);
    planner.held = new Set(["top"]);

    expect(getAllRelatedJobs("top").map((j) => j.jobID)).toEqual(["top"]);
  });
});

describe("loadAllRelatedJobs", () => {
  it("reaches a job the store does not hold", async () => {
    job("top", ["middle"]);
    job("middle", ["bottom"], ["top"]);
    job("bottom", [], ["middle"]);

    const found = await loadAllRelatedJobs("top");

    expect(found.map((j) => j.jobID).sort()).toEqual([
      "bottom",
      "middle",
      "top",
    ]);
  });

  it("takes several roots at once", async () => {
    job("one", ["shared"]);
    job("two", ["shared"]);
    job("shared", [], ["one", "two"]);

    const found = await loadAllRelatedJobs(["one", "two"]);

    expect(found.map((j) => j.jobID).sort()).toEqual(["one", "shared", "two"]);
  });

  it("asks for each job once, however many ways it is reachable", async () => {
    job("top", ["left", "right"]);
    job("left", ["shared"], ["top"]);
    job("right", ["shared"], ["top"]);
    job("shared", [], ["left", "right"]);

    await loadAllRelatedJobs("top");

    expect(asked.filter((jobID) => jobID === "shared")).toHaveLength(1);
  });

  // A chain naming a job nothing answers for must end, not come round again on
  // the next descent.
  it("ends on a chain naming a job that cannot be found", async () => {
    job("top", ["gone"]);

    const found = await loadAllRelatedJobs("top");

    expect(found.map((j) => j.jobID)).toEqual(["top"]);
    expect(asked.filter((jobID) => jobID === "gone")).toHaveLength(1);
  });
});
