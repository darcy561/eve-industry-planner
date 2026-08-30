import { describe, expect, test } from "vitest";
import Group from "./group.js";

function jobStub(jobID, { groupID = "group-1", itemID = 34, parents = [] } = {}) {
  return {
    jobID,
    groupID,
    itemID,
    name: jobID,
    parentJobs: parents,
    apiJobs: new Set(),
    apiOrders: new Set(),
    apiTransactions: new Set(),
    build: { materials: [] },
  };
}

describe("archived members", () => {
  test("an archived job stays a member but leaves the derived sets", () => {
    const jobs = [
      jobStub("job-a", { itemID: 587 }),
      jobStub("job-b", { itemID: 34, parents: ["job-a"] }),
    ];
    const group = new Group({ groupID: "group-1" });
    group.createGroup(jobs);

    group.markJobsArchived([jobs[1]], jobs);

    expect([...group.includedJobIDs].sort()).toEqual(["job-a", "job-b"]);
    expect([...group.archivedJobIDs]).toEqual(["job-b"]);
    expect([...group.includedTypeIDs]).toEqual([587]);
    expect(group.outputJobCount).toBe(1);
  });

  test("an archived member survives a later edit to the group", () => {
    const jobs = [
      jobStub("job-a", { itemID: 587 }),
      jobStub("job-b", { itemID: 34, parents: ["job-a"] }),
      jobStub("job-c", { itemID: 36, parents: ["job-a"] }),
    ];
    const group = new Group({ groupID: "group-1" });
    group.createGroup(jobs);
    group.markJobsArchived([jobs[2]], jobs);

    // Deleting another job recomputes membership from the jobs on the planner.
    group.removeJobsFromGroup([jobs[1]], [jobs[0], jobs[1]]);

    expect([...group.includedJobIDs].sort()).toEqual(["job-a", "job-c"]);
    expect([...group.archivedJobIDs]).toEqual(["job-c"]);
  });

  test("the archive marks survive a round trip through the document", () => {
    const group = new Group({ groupID: "group-1" });
    group.createGroup([jobStub("job-a"), jobStub("job-b")]);
    group.markJobsArchived([jobStub("job-b")], [jobStub("job-a")]);

    const restored = new Group(group.toDocument());

    expect([...restored.archivedJobIDs]).toEqual(["job-b"]);
    expect([...restored.includedJobIDs].sort()).toEqual(["job-a", "job-b"]);
  });
});
