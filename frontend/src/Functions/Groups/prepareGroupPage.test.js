import { beforeEach, describe, expect, it, vi } from "vitest";

const planner = {
  group: null,
  jobs: {},
  fetched: [],
  systemIndexes: null,
  multiSelectCleared: false,
};

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      jobData: {
        actions: {
          getGroupObject: (groupID) =>
            planner.group?.groupID === groupID ? planner.group : null,
          jobsFromIdsOrObjects: async (ids) => {
            planner.fetched.push([...ids]);
            return ids.map((jobID) => planner.jobs[jobID]).filter(Boolean);
          },
          clearMultiSelect: () => {
            planner.multiSelectCleared = true;
          },
        },
      },
      worldData: {
        actions: {
          addSystemIndex: (indexes) => {
            planner.systemIndexes = indexes;
          },
        },
      },
    }),
  );
});

const askedToPrice = { jobs: null };
vi.mock("../Shared/getMissingESIData", () => ({
  default: async (jobs) => {
    askedToPrice.jobs = jobs;
    return { requestedSystemIndexes: { 30000142: 0.05 } };
  },
}));

const { prepareGroupPage } = await import("./prepareGroupPage.js");

const job = (jobID, children = []) => ({
  jobID,
  parentJobs: [],
  build: { childJobs: children.length ? { 34: [...children] } : {} },
});

beforeEach(() => {
  planner.group = null;
  planner.jobs = {};
  planner.fetched = [];
  planner.systemIndexes = null;
  planner.multiSelectCleared = false;
  askedToPrice.jobs = null;
});

describe("opening a group", () => {
  it("says so when the planner holds no such group", async () => {
    expect(await prepareGroupPage("gone")).toBeNull();
    expect(planner.fetched).toEqual([]);
  });

  // The members are the roots of the walk, not the whole of it: a child job may
  // sit outside the group its parent is in.
  it("fetches what the members' chains reach, not only the members", async () => {
    planner.group = { groupID: "group-1", liveMemberIDs: ["parent"] };
    planner.jobs = {
      parent: job("parent", ["child"]),
      child: job("child"),
    };

    const group = await prepareGroupPage("group-1");

    expect(group).toBe(planner.group);
    expect(planner.fetched.flat()).toEqual(["parent", "child"]);
    expect(askedToPrice.jobs.map((each) => each.jobID)).toEqual([
      "parent",
      "child",
    ]);
  });

  it("keeps the system indexes it was given", async () => {
    planner.group = { groupID: "group-1", liveMemberIDs: ["parent"] };
    planner.jobs = { parent: job("parent") };

    await prepareGroupPage("group-1");

    expect(planner.systemIndexes).toEqual({ 30000142: 0.05 });
  });

  // The router preloads on intent, so this runs when a reader's pointer crosses a
  // group card on the planner. Clearing their selection then would take away
  // something they were in the middle of, for a page they have not asked for.
  it("leaves what the reader has selected alone", async () => {
    planner.group = { groupID: "group-1", liveMemberIDs: ["parent"] };
    planner.jobs = { parent: job("parent") };

    await prepareGroupPage("group-1");

    expect(planner.multiSelectCleared).toBe(false);
  });
});
