import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

const { default: repairMissingParentChildRelationships } =
  await import("./repairParentChildRelationships.js");

const job = (overrides = {}) => ({
  jobID: "job-1",
  itemID: 587,
  parentJobs: [],
  build: {
    materials: { 34: { typeID: 34, name: "Tritanium" } },
    childJobs: {},
  },
  ...overrides,
});

beforeEach(() => {
  store.current = { jobData: { actions: { findJobInJobArray: () => null } } };
});

// A repair runs over every material on the way to saving, and a material with
// no child jobs has no entry to walk rather than an empty one. The function
// swallows what it throws, so a test that only asserts it did not throw proves
// nothing — what it answers is the evidence.
describe("repairing a job's links", () => {
  it("passes over a material that has no child jobs", () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});

    const repaired = repairMissingParentChildRelationships(job(), []);

    expect(repaired).toEqual(new Set());
    expect(failed).not.toHaveBeenCalled();
    failed.mockRestore();
  });

  // The caller spreads what comes back, so a repair that gave up partway used
  // to turn one failure into a second, stranger one further down the save.
  it("answers with what it repaired even when something goes wrong", () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});

    const repaired = repairMissingParentChildRelationships(null, []);

    expect(repaired).toEqual(new Set());
    expect(failed).toHaveBeenCalled();
    failed.mockRestore();
  });

  // A child the planner no longer holds is cut loose rather than left naming a
  // job nothing answers to.
  it("cuts loose a child job the planner has lost", () => {
    const withChild = job({
      build: {
        materials: { 34: { typeID: 34, name: "Tritanium" } },
        childJobs: { 34: ["child-gone"] },
      },
    });

    repairMissingParentChildRelationships(withChild, []);

    expect(withChild.build.childJobs[34]).toEqual([]);
  });
});
