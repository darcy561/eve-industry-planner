import { beforeEach, describe, expect, it } from "vitest";

const { default: useUsersStore } = await import("../usersStore.js");

function actions() {
  return useUsersStore.getState().jobData.actions;
}

function skeletons() {
  return useUsersStore.getState().jobData.pendingInboundNewJobSkeletonByJobId;
}

describe("inbound job skeletons", () => {
  beforeEach(() => {
    actions().resetJobDataStore();
  });

  it("holds a placeholder for a job that has arrived but not been flushed", () => {
    actions().addPendingInboundNewJobSkeleton("job-1", {
      stageId: 2,
      groupID: "group-1",
    });

    expect(skeletons()).toEqual({
      "job-1": { stageId: 2, groupID: "group-1" },
    });
  });

  it("keeps one placeholder per job", () => {
    actions().addPendingInboundNewJobSkeleton("job-1", {
      stageId: 1,
      groupID: "",
    });
    actions().addPendingInboundNewJobSkeleton("job-2", {
      stageId: 3,
      groupID: "",
    });
    actions().addPendingInboundNewJobSkeleton("job-1", {
      stageId: 4,
      groupID: "",
    });

    expect(skeletons()["job-1"].stageId).toBe(4);
    expect(Object.keys(skeletons())).toEqual(["job-1", "job-2"]);
  });

  it("drops the placeholders named and keeps the rest", () => {
    actions().addPendingInboundNewJobSkeleton("job-1", {
      stageId: 1,
      groupID: "",
    });
    actions().addPendingInboundNewJobSkeleton("job-2", {
      stageId: 1,
      groupID: "",
    });

    actions().removePendingInboundNewJobSkeletons(["job-1", "job-unknown"]);

    expect(Object.keys(skeletons())).toEqual(["job-2"]);
  });

  it.each([[[]], [null], [undefined]])("ignores %p", (jobIDs) => {
    actions().addPendingInboundNewJobSkeleton("job-1", {
      stageId: 1,
      groupID: "",
    });
    actions().removePendingInboundNewJobSkeletons(jobIDs);
    expect(Object.keys(skeletons())).toEqual(["job-1"]);
  });
});
