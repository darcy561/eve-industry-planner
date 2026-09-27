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

describe("repairing a job's links", () => {
  it("passes over a material that has no child jobs", () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});

    const repaired = repairMissingParentChildRelationships(job(), []);

    expect(repaired).toEqual(new Set());
    expect(failed).not.toHaveBeenCalled();
    failed.mockRestore();
  });

  it("answers with what it repaired even when something goes wrong", () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});

    const repaired = repairMissingParentChildRelationships(null, []);

    expect(repaired).toEqual(new Set());
    expect(failed).toHaveBeenCalled();
    failed.mockRestore();
  });

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
