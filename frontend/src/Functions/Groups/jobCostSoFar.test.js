import { jobMaking } from "../../tests/editJobFixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";

const jobsById = new Map();

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      jobData: {
        actions: { findJobInJobArray: (id) => jobsById.get(id) ?? null },
      },
    }),
  );
});

const captureException = vi.fn();
vi.mock("@sentry/react", () => ({
  captureException: (...args) => captureException(...args),
}));

vi.mock("../Installation Costs/installCosts.js", () => ({
  getJobInstallCostForPlanning: (job) => job.plannedInstallCost ?? 0,
}));

const { jobCostSoFar } = await import("./jobCostSoFar.js");

function job({
  id,
  produced = 1,
  installCost = 0,
  actualInstallCost = 0,
  extras = 0,
  materials = [],
  childJobs = {},
} = {}) {
  const built = jobMaking(produced, {
    plannedInstallCost: installCost,
    esi: {
      industryJobs: actualInstallCost
        ? { 1: { job_id: 1, cost: actualInstallCost } }
        : {},
    },
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: Object.fromEntries(
            materials.map((m) => [String(m.typeID), { quantity: m.quantity }]),
          ),
        },
      },
      materials: Object.fromEntries(
        materials.map((m) => [String(m.typeID), m]),
      ),
      childJobs,
      extrasCosts: extras
        ? { "extra-1": { id: "extra-1", extraValue: extras } }
        : {},
    },
  });
  if (id) jobsById.set(id, built);
  return built;
}

const bought = (typeID, cost, quantity = 1) => ({
  typeID,
  quantity,
  purchasing: {
    "p-1": { id: "p-1", itemCount: quantity, itemCost: cost / quantity },
  },
});

const toBuild = (typeID, quantity, fallbackCost = 0) => ({
  typeID,
  quantity,
  purchasing: fallbackCost
    ? { "p-1": { id: "p-1", itemCount: 1, itemCost: fallbackCost } }
    : {},
});

beforeEach(() => {
  jobsById.clear();
  captureException.mockClear();
});

describe("build cost from children", () => {
  it("is nothing for a job with no build", () => {
    expect(jobCostSoFar({})).toBe(0);
    expect(jobCostSoFar(null)).toBe(0);
  });

  it("is nothing for a job that produces nothing, rather than dividing by zero", () => {
    const outputJob = job({ produced: 0, installCost: 100 });

    expect(jobCostSoFar(outputJob)).toBe(0);
  });

  it("is quoted per unit produced, not as the whole job", () => {
    const outputJob = job({ produced: 10, installCost: 500, extras: 500 });

    expect(jobCostSoFar(outputJob)).toBe(100);
  });

  it("charges a bought material at what was paid", () => {
    const outputJob = job({
      produced: 1,
      materials: [bought(34, 250)],
    });

    expect(jobCostSoFar(outputJob)).toBe(250);
  });

  it("charges a built material at what its child job costs per unit", () => {
    job({
      id: "child-1",
      produced: 100,
      installCost: 300,
      extras: 200,
      materials: [bought(34, 500)],
    });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10)],
      childJobs: { 35: ["child-1"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(100);
  });

  it("walks a child's own children rather than stopping a level down", () => {
    job({
      id: "grandchild",
      produced: 10,
      installCost: 100,
      materials: [bought(34, 900)],
    });
    job({
      id: "child-1",
      produced: 10,
      installCost: 0,
      materials: [toBuild(35, 10)],
      childJobs: { 35: ["grandchild"] },
    });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(36, 10)],
      childJobs: { 36: ["child-1"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(1000);
  });

  it("uses what was paid when a material is already bought in full, children or not", () => {
    job({ id: "child-1", produced: 100, installCost: 99_999 });
    const outputJob = job({
      produced: 1,
      materials: [bought(35, 42)],
      childJobs: { 35: ["child-1"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(42);
  });

  it("falls back to what was paid when a named child job cannot be found", () => {
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10, 777)],
      childJobs: { 35: ["missing-job"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(777);
  });

  it("falls back to what was paid when the children produce nothing", () => {
    job({ id: "child-1", produced: 0, installCost: 500 });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10, 640)],
      childJobs: { 35: ["child-1"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(640);
  });

  it("spreads several children of one material over their combined output", () => {
    job({ id: "child-1", produced: 50, installCost: 250 });
    job({ id: "child-2", produced: 50, installCost: 750 });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10)],
      childJobs: { 35: ["child-1", "child-2"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(100);
  });

  it("charges the install cost actually incurred when asked for actuals", () => {
    const outputJob = job({
      produced: 1,
      installCost: 100,
      actualInstallCost: 250,
    });

    expect(
      jobCostSoFar(outputJob, {
        installCostMode: "actual",
      }),
    ).toBe(250);
  });
});

describe("what it does with awkward input", () => {
  it("treats a job with no materials as costing only its own install and extras", () => {
    const outputJob = job({ produced: 2, installCost: 100, extras: 50 });
    delete outputJob.build.materials;

    expect(jobCostSoFar(outputJob)).toBe(75);
  });

  it("treats a material with no child job list as bought", () => {
    const outputJob = job({ produced: 1, materials: [toBuild(35, 10, 500)] });
    delete outputJob.build.childJobs;

    expect(jobCostSoFar(outputJob)).toBe(500);
  });

  it("treats a child job entry that is not a list as no children at all", () => {
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10, 500)],
      childJobs: { 35: "child-1" },
    });

    expect(jobCostSoFar(outputJob)).toBe(500);
  });

  it("reads a numeric string as the number it looks like", () => {
    const outputJob = job({
      produced: 2,
      materials: [{ ...bought(34, "250"), quantity: 1 }],
    });

    expect(jobCostSoFar(outputJob)).toBe(125);
  });

  it("reads an unusable purchased cost as nothing rather than spreading NaN", () => {
    const outputJob = job({
      produced: 1,
      materials: [{ ...bought(34, "not a number"), quantity: 1 }],
    });

    expect(jobCostSoFar(outputJob)).toBe(0);
  });

  it("is nothing when the output quantity is unusable", () => {
    expect(jobCostSoFar(job({ produced: "many", installCost: 100 }))).toBe(0);
    expect(jobCostSoFar(job({ produced: -5, installCost: 100 }))).toBe(0);
  });

  it("sums every material rather than stopping at the first", () => {
    const outputJob = job({
      produced: 1,
      materials: [bought(34, 100), bought(35, 200), bought(36, 300)],
    });

    expect(jobCostSoFar(outputJob)).toBe(600);
  });

  it("skips a child job that has no build without dropping its siblings", () => {
    jobsById.set("shell", { jobID: "shell" });
    job({ id: "child-1", produced: 100, installCost: 1000 });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10)],
      childJobs: { 35: ["shell", "child-1"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(100);
  });

  it("counts a child named twice twice, cost and output alike", () => {
    job({ id: "child-1", produced: 50, installCost: 500 });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10)],
      childJobs: { 35: ["child-1", "child-1"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(100);
  });

  it("charges nothing for a material the job needs none of", () => {
    job({ id: "child-1", produced: 100, installCost: 1000 });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 0)],
      childJobs: { 35: ["child-1"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(0);
  });

  it("charges a child's extras as well as its install", () => {
    job({ id: "child-1", produced: 10, installCost: 40, extras: 60 });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10)],
      childJobs: { 35: ["child-1"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(100);
  });

  it("stops a child job that leads back to itself, and says so", () => {
    const looping = job({
      id: "loop",
      produced: 10,
      installCost: 500,
      materials: [toBuild(35, 2, 42)],
      childJobs: { 35: ["loop"] },
    });
    jobsById.set("loop", looping);
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10, 777)],
      childJobs: { 35: ["loop"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(542);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("stops a job listed as its own child", () => {
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10, 777)],
      childJobs: { 35: ["self"] },
    });
    outputJob.jobID = "self";
    jobsById.set("self", outputJob);

    expect(jobCostSoFar(outputJob)).toBe(777);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("stops a cycle that runs through a second job before returning", () => {
    job({
      id: "cycle-b",
      produced: 10,
      installCost: 200,
      materials: [toBuild(34, 2, 11)],
      childJobs: { 34: ["cycle-a"] },
    });
    job({
      id: "cycle-a",
      produced: 10,
      installCost: 300,
      materials: [toBuild(35, 1, 0)],
      childJobs: { 35: ["cycle-b"] },
    });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(36, 10, 999)],
      childJobs: { 36: ["cycle-a"] },
    });
    outputJob.jobID = "output-with-cycle";

    expect(jobCostSoFar(outputJob)).toBeCloseTo(321.1);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("still counts a job reached down two separate branches twice", () => {
    job({ id: "shared", produced: 10, installCost: 100 });
    job({
      id: "child-a",
      produced: 10,
      installCost: 0,
      materials: [toBuild(34, 10)],
      childJobs: { 34: ["shared"] },
    });
    job({
      id: "child-b",
      produced: 10,
      installCost: 0,
      materials: [toBuild(34, 10)],
      childJobs: { 34: ["shared"] },
    });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 20)],
      childJobs: { 35: ["child-a", "child-b"] },
    });

    expect(jobCostSoFar(outputJob)).toBe(200);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("says nothing when there is no cycle to report", () => {
    job({ id: "child-1", produced: 10, installCost: 100 });
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 10)],
      childJobs: { 35: ["child-1"] },
    });

    jobCostSoFar(outputJob);

    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("how often a cycle is reported", () => {
  it("reports a cycle once however many times the cost is worked out", () => {
    const looping = job({
      id: "repeat-loop",
      produced: 10,
      installCost: 100,
      materials: [toBuild(35, 2, 5)],
      childJobs: { 35: ["repeat-loop"] },
    });
    jobsById.set("repeat-loop", looping);
    const outputJob = job({
      produced: 1,
      materials: [toBuild(35, 1, 0)],
      childJobs: { 35: ["repeat-loop"] },
    });

    jobCostSoFar(outputJob);
    jobCostSoFar(outputJob);
    jobCostSoFar(outputJob);

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
