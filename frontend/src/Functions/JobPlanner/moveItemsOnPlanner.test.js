import { beforeEach, describe, expect, it, vi } from "vitest";

import { jobFromDocument } from "../Job/jobDocument";
import Group from "../../Classes/group";

const { jobsByID, groupsByID, account, saved } = vi.hoisted(() => ({
  jobsByID: new Map(),
  groupsByID: new Map(),
  account: { isLoggedIn: false },
  saved: { jobs: [], groups: [], queuedGroupIDs: [] },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account,
      jobData: {
        actions: {
          findJobInJobArray: (id) => jobsByID.get(id) ?? null,
          getGroupObject: (id) => groupsByID.get(id) ?? null,
          updateOrAddJobsToJobArray: (jobs) => saved.jobs.push(...jobs),
          updateModifiedGroups: (groups) => saved.groups.push(...groups),
          queueJobGroupWritesAndSchedule: (ids) =>
            saved.queuedGroupIDs.push(...ids),
        },
      },
    }),
  );
});

const scheduleSaveJobsViaApi = vi.fn();
vi.mock("../Job/sync/saveJobsViaApi.js", () => ({
  scheduleSaveJobsViaApi: (...args) => scheduleSaveJobsViaApi(...args),
}));

const { default: moveItemsOnPlanner } = await import("./moveItemsOnPlanner.js");

function job(jobID, jobStatus) {
  const built = jobFromDocument({ jobID, jobStatus, itemID: 587, jobType: 1 });
  jobsByID.set(jobID, built);
  return built;
}

function group(groupID, groupStatus) {
  const built = new Group({ groupID, groupStatus });
  groupsByID.set(groupID, built);
  return built;
}

beforeEach(() => {
  jobsByID.clear();
  groupsByID.clear();
  account.isLoggedIn = false;
  saved.jobs = [];
  saved.groups = [];
  saved.queuedGroupIDs = [];
  scheduleSaveJobsViaApi.mockClear();
});

describe("moving what the reader selected", () => {
  it("steps a job forward", async () => {
    job("job-1", 1);

    await moveItemsOnPlanner("job-1", "forward");

    expect(saved.jobs.map((moved) => moved.jobStatus)).toEqual([2]);
  });

  it("steps a job backward", async () => {
    job("job-1", 2);

    await moveItemsOnPlanner("job-1", "backward");

    expect(saved.jobs.map((moved) => moved.jobStatus)).toEqual([1]);
  });

  it("steps a group rather than treating it as a job", async () => {
    group("group-1", 1);

    await moveItemsOnPlanner("group-1", "forward");

    expect(saved.groups.map((moved) => moved.groupStatus)).toEqual([2]);
    expect(saved.jobs).toEqual([]);
  });

  it("moves a mixed selection of both", async () => {
    job("job-1", 1);
    group("group-1", 1);

    await moveItemsOnPlanner(["job-1", "group-1"], "forward");

    expect(saved.jobs).toHaveLength(1);
    expect(saved.groups).toHaveLength(1);
  });

  it("leaves an id that names neither kind alone", async () => {
    job("something-else", 1);
    group("group-1", 1);

    await moveItemsOnPlanner(["something-else", "group-1"], "forward");

    expect(saved.jobs).toEqual([]);
    expect(saved.groups).toHaveLength(1);
  });

  it("does nothing without a direction, or with nothing selected", async () => {
    job("job-1", 1);

    await moveItemsOnPlanner("job-1", "");
    await moveItemsOnPlanner([], "forward");

    expect(saved.jobs).toEqual([]);
  });

  it("moves each selected id once, however many times it was named", async () => {
    job("job-1", 1);

    await moveItemsOnPlanner(["job-1", "job-1"], "forward");

    expect(saved.jobs.map((moved) => moved.jobStatus)).toEqual([2]);
  });
});

describe("what it leaves untouched", () => {
  it("does not step the job the planner is holding", async () => {
    const held = job("job-1", 1);

    await moveItemsOnPlanner("job-1", "forward");

    expect(held.jobStatus).toBe(1);
    expect(saved.jobs[0]).not.toBe(held);
  });

  it("does not step the group the planner is holding", async () => {
    const held = group("group-1", 1);

    await moveItemsOnPlanner("group-1", "forward");

    expect(held.groupStatus).toBe(1);
  });

  it("says nothing about a job that cannot be found", async () => {
    await moveItemsOnPlanner("job-missing", "forward");

    expect(saved.jobs).toEqual([]);
  });

  it("holds a job at the first step rather than stepping below it", async () => {
    job("job-1", 0);

    await moveItemsOnPlanner("job-1", "backward");

    expect(saved.jobs).toEqual([]);
  });
});

describe("persisting the move", () => {
  it("schedules a write for a signed-in reader", async () => {
    account.isLoggedIn = true;
    job("job-1", 1);

    await moveItemsOnPlanner("job-1", "forward");

    expect(scheduleSaveJobsViaApi).toHaveBeenCalledOnce();
  });

  it("writes nothing for a reader who is not signed in", async () => {
    job("job-1", 1);

    await moveItemsOnPlanner("job-1", "forward");

    expect(scheduleSaveJobsViaApi).not.toHaveBeenCalled();
  });
});
