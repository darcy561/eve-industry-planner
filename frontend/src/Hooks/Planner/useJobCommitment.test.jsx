import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const jobsInStore = {};

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    jobData: { actions: { findJobInJobArray: (id) => jobsInStore[id] } },
  });
});

const { useJobCommitment } = await import("./useJobCommitment");
const { default: useUsersStore } = await import("../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

const parentNeeding = (quantity, children = ["job-1"]) => ({
  build: {
    materials: { [String(34)]: { typeID: 34, quantity } },
    childJobs: { 34: children },
  },
});

/** A job making ten of item 34, as the planner stores one. */
const jobDocument = (parentJobs = []) => ({
  jobID: "job-1",
  itemID: 34,
  itemsProducedPerRun: 10,
  parentJobs,
  layout: { setupToEdit: "setup0" },
  build: {
    materials: {},
    childJobs: {},
    setup: {
      setup0: { id: "setup0", runCount: 1, jobCount: 1, materialCount: {} },
    },
  },
  esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
});

const openJob = (parentJobIDs = []) => {
  session().actions.closeSession();
  session().actions.openJob("job-1", jobDocument(parentJobIDs));
};

const commitmentFor = (parentJobIDs = []) => {
  openJob(parentJobIDs);
  return renderHook(() => useJobCommitment()).result.current;
};

// Three panels act on this figure and must agree: Returns prices the surplus,
// Cost Breakdown charges fee and tax on it, and Skills only asks what selling
// costs when there is something to sell.
describe("useJobCommitment", () => {
  it("leaves a job with no parents free to sell everything it makes", () => {
    const commitment = commitmentFor([]);

    expect(commitment.hasParents).toBe(false);
    expect(commitment.surplus).toBe(10);
  });

  it("commits the output a parent needs", () => {
    jobsInStore.p1 = parentNeeding(10);

    const commitment = commitmentFor(["p1"]);

    expect(commitment.committed).toBe(10);
    expect(commitment.surplus).toBe(0);
  });

  it("leaves the overproduction sellable", () => {
    jobsInStore.p1 = parentNeeding(4);

    const commitment = commitmentFor(["p1"]);

    expect(commitment.committed).toBe(4);
    expect(commitment.surplus).toBe(6);
  });

  // A parent that has been deleted asks for nothing rather than throwing.
  it("passes over a parent it cannot read", () => {
    const commitment = commitmentFor(["missing"]);

    expect(commitment.committed).toBe(0);
    expect(commitment.surplus).toBe(10);
  });

  // The parent ids are rebuilt on every read of them, so keying the memo on the
  // array itself would re-derive on every dispatch anywhere.
  it("holds its answer while the parents are unchanged", () => {
    jobsInStore.p1 = parentNeeding(4);
    openJob(["p1"]);

    const { result, rerender } = renderHook(() => useJobCommitment());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
