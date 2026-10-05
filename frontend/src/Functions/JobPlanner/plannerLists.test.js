import { describe, expect, it } from "vitest";
import {
  filterGroupsForJobPlannerStage,
  filterJobsForJobPlannerStage,
  filterJobsVisibleInActiveGroup,
  sortJobsForPlannerStage,
} from "./plannerLists.js";

const job = (jobID, name, jobStatus, displayOnPlanner = true) => ({
  jobID,
  name,
  jobStatus,
  displayOnPlanner,
  build: { materials: {} },
});

describe("the jobs and groups a planner stage shows", () => {
  it("shows the jobs at the stage that are on the planner", () => {
    const jobs = [job("a", "A", 1), job("b", "B", 2), job("c", "C", 1, false)];

    expect(filterJobsForJobPlannerStage(jobs, "1").map((j) => j.jobID)).toEqual(
      ["a"],
    );
  });

  it("shows the groups at the stage", () => {
    const groups = [
      { groupID: "g1", groupStatus: 1 },
      { groupID: "g2", groupStatus: 3 },
    ];

    expect(filterGroupsForJobPlannerStage(groups, 1)).toEqual([groups[0]]);
  });

  it("shows nothing for a group page without a group", () => {
    const jobs = [job("a", "A", 1)];

    expect(filterJobsVisibleInActiveGroup(jobs, null)).toEqual([]);
    expect(filterJobsVisibleInActiveGroup(jobs, { groupID: "g" })).toBe(jobs);
  });
});

describe("sorting a planner stage", () => {
  it("orders the purchasing stage by name among jobs equally ready", () => {
    const jobs = [job("b", "Wolf", 1), job("a", "Rifter", 1)];

    expect(sortJobsForPlannerStage(jobs, 1).map((j) => j.name)).toEqual([
      "Rifter",
      "Wolf",
    ]);
  });

  it("leaves a stage with no ordering of its own as it is", () => {
    const jobs = [job("b", "Wolf", 2), job("a", "Rifter", 2)];

    expect(sortJobsForPlannerStage(jobs, 2)).toBe(jobs);
  });
});
