import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const jobsInStore = {};

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock({
    jobData: { actions: { findJobInJobArray: (id) => jobsInStore[id] } },
  });
});

const { useJobCommitment } = await import("./useJobCommitment");
const { jobFixture } = await import("../../tests/jobFixture");

const parentNeeding = (quantity, children = ["job-1"]) => ({
  build: {
    materials: [{ typeID: 34, quantity }],
    childJobs: { 34: children },
  },
});

const commitmentFor = (parentJobIDs = [], activeJob = jobFixture()) =>
  renderHook(() =>
    useJobCommitment({
      state: { activeJob },
      actions: { getCurrentParentJobs: () => parentJobIDs },
    }),
  ).result.current;

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

  // The array from getCurrentParentJobs is rebuilt on every render, so keying
  // the memo on it directly would re-derive on every dispatch anywhere.
  it("holds its answer while the parents are unchanged", () => {
    jobsInStore.p1 = parentNeeding(4);
    const activeJob = jobFixture();

    const { result, rerender } = renderHook(() =>
      useJobCommitment({
        state: { activeJob },
        actions: { getCurrentParentJobs: () => ["p1"] },
      }),
    );
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
