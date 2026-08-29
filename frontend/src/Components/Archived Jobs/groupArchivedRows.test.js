import { describe, it, expect } from "vitest";
import { groupArchivedRows, blockTotals } from "./groupArchivedRows";

function job(overrides) {
  return { jobID: "job-1", name: "Rifter", ...overrides };
}

describe("groupArchivedRows", () => {
  it("returns nothing for no rows", () => {
    expect(groupArchivedRows([])).toEqual([]);
    expect(groupArchivedRows()).toEqual([]);
  });

  // A job with neither a group nor a related set is its own row: a block of one
  // would invent a container the build does not have.
  it("draws unlinked jobs as standalone rows", () => {
    const blocks = groupArchivedRows([
      job({ jobID: "a" }),
      job({ jobID: "b" }),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.kind === "job")).toBe(true);
  });

  it("collects a group into one block", () => {
    const blocks = groupArchivedRows([
      job({ jobID: "a", groupID: "g1" }),
      job({ jobID: "b", groupID: "g1" }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("group");
    expect(blocks[0].jobs).toHaveLength(2);
  });

  it("collects a related set into one block", () => {
    const blocks = groupArchivedRows([
      job({ jobID: "a", relatedSetID: "s1" }),
      job({ jobID: "b", relatedSetID: "s1" }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("related");
  });

  // A group is the container the user named and archived as a unit, so it wins
  // over the dependency graph the build happens to have.
  it("prefers the group when a row has both", () => {
    const blocks = groupArchivedRows([
      job({ jobID: "a", groupID: "g1", relatedSetID: "s1" }),
    ]);
    expect(blocks[0].kind).toBe("group");
    expect(blocks[0].id).toBe("g1");
  });

  // Two groups must not merge, and a group must not absorb a related set that
  // happens to sit beside it.
  it("keeps separate containers apart", () => {
    const blocks = groupArchivedRows([
      job({ jobID: "a", groupID: "g1" }),
      job({ jobID: "b", groupID: "g2" }),
      job({ jobID: "c", relatedSetID: "s1" }),
      job({ jobID: "d" }),
    ]);
    expect(blocks).toHaveLength(4);
  });

  // The group document is deleted when a group is archived, so there is no name
  // to show: blocks are named after what they produce.
  it("names a block after its jobs", () => {
    const one = groupArchivedRows([job({ groupID: "g1", name: "Rifter" })]);
    expect(one[0].label).toBe("Rifter");

    const many = groupArchivedRows([
      job({ jobID: "a", groupID: "g1", name: "Rifter" }),
      job({ jobID: "b", groupID: "g1", name: "Punisher" }),
      job({ jobID: "c", groupID: "g1", name: "Merlin" }),
    ]);
    expect(many[0].label).toBe("Rifter + 2 more");
  });

  it("labels a block with no names rather than showing nothing", () => {
    const blocks = groupArchivedRows([job({ groupID: "g1", name: "" })]);
    expect(blocks[0].label).toBe("Untitled");
  });
});

describe("blockTotals", () => {
  it("sums the rows it can count", () => {
    const totals = blockTotals([
      job({ measures: { jobCostTotal: 100, profitLoss: 40 } }),
      job({ measures: { jobCostTotal: 50, profitLoss: -10 } }),
    ]);
    expect(totals.jobCostTotal).toBe(150);
    expect(totals.profitLoss).toBe(30);
    expect(totals.counted).toBe(2);
    expect(totals.uncounted).toBe(0);
  });

  // A job the rebuild has not folded has no measures. Counting it as zero would
  // report a total that quietly excludes it while claiming to include it.
  it("reports rows it could not count", () => {
    const totals = blockTotals([
      job({ measures: { jobCostTotal: 100, profitLoss: 40 } }),
      job({ jobID: "b" }),
    ]);
    expect(totals.jobCostTotal).toBe(100);
    expect(totals.counted).toBe(1);
    expect(totals.uncounted).toBe(1);
  });

  it("handles an empty block", () => {
    expect(blockTotals([])).toEqual({
      jobCostTotal: 0,
      profitLoss: 0,
      counted: 0,
      uncounted: 0,
    });
  });
});
