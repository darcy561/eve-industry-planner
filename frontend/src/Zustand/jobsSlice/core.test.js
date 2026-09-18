import { beforeEach, describe, expect, it, vi } from "vitest";

/** Ids the API was asked for, one entry per call. */
const requested = [];
let apiResponse = [];
let apiError = null;

vi.mock(
  "../../Functions/Endpoints/Private/requestJobDocumentsByIds.js",
  () => ({
    requestJobDocumentsByIdsFromApi: async (ids) => {
      requested.push(ids);
      if (apiError) throw apiError;
      return apiResponse;
    },
  }),
);

const { default: useUsersStore } = await import("../usersStore.js");

function actions() {
  return useUsersStore.getState().jobData.actions;
}

function jobIDs() {
  return useUsersStore.getState().jobData.jobArray.map((j) => j.jobID);
}

const job = (jobID, name = jobID) => ({ jobID, name });

describe("the planner's jobs", () => {
  beforeEach(() => {
    requested.length = 0;
    apiResponse = [];
    apiError = null;
    actions().resetJobDataStore();
    useUsersStore.getState().account.actions.setLoggedIn(false);
  });

  /*
   * Every test here resets before it runs, so a field the reset stopped
   * clearing would go unnoticed by all of them — this is the one place that
   * looks at what a reset leaves behind.
   */
  it("resets every field the planner holds", () => {
    actions().replaceJobArray([job("job-1")], { owner: "corp:1" });
    actions().replaceGroupArray([{ groupID: "group-1" }]);
    actions().setActiveJobID("job-1");
    actions().setActiveGroupID("group-1");
    actions().addToMultiSelect(["job-1"]);
    actions().setUserWatchlist([{ id: "item-1" }], [{ id: "wgroup-1" }]);
    actions().addPendingInboundNewJobSkeleton("job-2", {
      stageId: 1,
      groupID: "",
    });
    actions().queueJobDocumentWrites("job-1");
    actions().queueJobGroupWrites("group-1");

    actions().resetJobDataStore();

    const { actions: held, ...state } = useUsersStore.getState().jobData;
    expect(held).toBeDefined();
    expect(state).toEqual({
      multiSelect: [],
      owner: null,
      jobArray: [],
      pendingInboundNewJobSkeletonByJobId: {},
      groupArray: [],
      pendingJobGroupWrites: [],
      pendingJobDocumentWrites: [],
      activeJobID: null,
      activeGroupID: null,
      userWatchlist: { groups: [], items: [] },
    });
  });

  describe("replacing the array", () => {
    it("takes the jobs and the planner they belong to", () => {
      actions().replaceJobArray([job("job-1")], { owner: "corp:1" });

      expect(jobIDs()).toEqual(["job-1"]);
      expect(useUsersStore.getState().jobData.owner).toBe("corp:1");
    });

    it("reads an absent array as empty", () => {
      actions().replaceJobArray(undefined);
      expect(jobIDs()).toEqual([]);
    });
  });

  it("empties the array without touching the planner it was for", () => {
    actions().replaceJobArray([job("job-1")], { owner: "corp:1" });
    actions().clearJobArray();

    expect(jobIDs()).toEqual([]);
  });

  describe("adding", () => {
    beforeEach(() => {
      actions().replaceJobArray([job("job-1")]);
    });

    it.each([
      ["addJobsToJobArray", (jobs) => actions().addJobsToJobArray(jobs)],
      [
        "addRetrievedJobsToJobArray",
        (jobs) => actions().addRetrievedJobsToJobArray(jobs),
      ],
    ])("%s keeps a job it already holds", (_name, add) => {
      add([job("job-1", "changed"), job("job-2")]);

      expect(jobIDs()).toEqual(["job-1", "job-2"]);
      expect(actions().findJobInJobArray("job-1").name).toBe("job-1");
    });

    it("takes a single job as well as an array", () => {
      actions().addJobsToJobArray(job("job-2"));
      expect(jobIDs()).toEqual(["job-1", "job-2"]);
    });
  });

  describe("updating or adding", () => {
    it("replaces a job it holds and appends one it does not", () => {
      actions().replaceJobArray([job("job-1"), job("job-2")]);

      actions().updateOrAddJobsToJobArray([
        job("job-1", "changed"),
        job("job-3"),
      ]);

      expect(actions().findJobInJobArray("job-1").name).toBe("changed");
      expect(jobIDs()).toEqual(["job-2", "job-1", "job-3"]);
    });

    /*
     * A websocket flush can carry the same job twice — the later one is the
     * document as it now stands, so it is the one kept.
     */
    it("keeps the last of a repeated job", () => {
      actions().updateOrAddJobsToJobArray([
        job("job-1", "first"),
        job("job-1", "second"),
      ]);

      expect(jobIDs()).toEqual(["job-1"]);
      expect(actions().findJobInJobArray("job-1").name).toBe("second");
    });
  });

  describe("removing", () => {
    beforeEach(() => {
      actions().replaceJobArray([job("job-1"), job("job-2"), job("job-3")]);
    });

    it.each([
      ["one id", "job-2", ["job-1", "job-3"]],
      ["several", ["job-1", "job-3"], ["job-2"]],
    ])("removes %s", (_label, input, remaining) => {
      actions().removeJobsFromJobArray(input);
      expect(jobIDs()).toEqual(remaining);
    });

    /*
     * Nothing removed is a no-change path, and the store compares with
     * `Object.is` — returning a rebuilt array would wake every subscriber for a
     * removal that did not happen.
     */
    it("leaves the state object alone when it holds none of them", () => {
      const before = useUsersStore.getState();

      actions().removeJobsFromJobArray("job-gone");

      expect(useUsersStore.getState()).toBe(before);
    });
  });

  it("merges and removes in one write", () => {
    actions().replaceJobArray([job("job-1"), job("job-2")]);

    actions().mergeAndRemoveJobsFromJobArray([job("job-3")], ["job-1"]);

    expect(jobIDs()).toEqual(["job-2", "job-3"]);
  });

  it("finds a job by id, and returns nothing for one it does not hold", () => {
    actions().replaceJobArray([job("job-1")]);

    expect(actions().findJobInJobArray("job-1").name).toBe("job-1");
    expect(actions().findJobInJobArray("job-gone")).toBeUndefined();
  });

  describe("resolving ids and objects to jobs", () => {
    beforeEach(() => {
      actions().replaceJobArray([job("job-1"), job("job-2")]);
    });

    it.each([
      ["null", null],
      ["undefined", undefined],
      ["a string that names no job", "something-else"],
      ["an object that is not a job", { name: "no id" }],
    ])("resolves %s to nothing", async (_label, input) => {
      await expect(actions().jobsFromIdsOrObjects(input)).resolves.toEqual([]);
    });

    it.each([
      ["an array", ["job-1", "job-2"]],
      ["a set", new Set(["job-1", "job-2"])],
    ])("resolves %s of ids to the jobs held", async (_label, input) => {
      const jobs = await actions().jobsFromIdsOrObjects(input);
      expect(jobs.map((j) => j.jobID)).toEqual(["job-1", "job-2"]);
    });

    it("hands a job object straight back", async () => {
      const passed = job("job-9");
      await expect(actions().jobsFromIdsOrObjects(passed)).resolves.toEqual([
        passed,
      ]);
    });

    it("returns each job once, in the order asked for", async () => {
      const jobs = await actions().jobsFromIdsOrObjects([
        "job-2",
        "job-1",
        "job-2",
        job("job-1"),
      ]);

      expect(jobs.map((j) => j.jobID)).toEqual(["job-2", "job-1"]);
    });

    describe("a job the planner does not hold", () => {
      it("is not asked for while signed out", async () => {
        const jobs = await actions().jobsFromIdsOrObjects(["job-away"]);

        expect(requested).toEqual([]);
        expect(jobs).toEqual([]);
      });

      it("is fetched and kept once signed in", async () => {
        useUsersStore.getState().account.actions.setLoggedIn(true);
        apiResponse = [job("job-away", "fetched")];

        const jobs = await actions().jobsFromIdsOrObjects(["job-away"]);

        expect(requested).toEqual([["job-away"]]);
        expect(jobs.map((j) => j.jobID)).toEqual(["job-away"]);
        expect(actions().findJobInJobArray("job-away").name).toBe("fetched");
      });

      it("is not asked for when the planner already holds it", async () => {
        useUsersStore.getState().account.actions.setLoggedIn(true);

        await actions().jobsFromIdsOrObjects(["job-1", "job-2"]);

        expect(requested).toEqual([]);
      });

      /*
       * A failed read leaves the caller with what could be resolved rather than
       * failing the flow that asked — a shopping list still opens.
       */
      it("leaves the rest resolved when the read fails", async () => {
        useUsersStore.getState().account.actions.setLoggedIn(true);
        apiError = new Error("network");
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});

        const jobs = await actions().jobsFromIdsOrObjects([
          "job-1",
          "job-away",
        ]);

        expect(jobs.map((j) => j.jobID)).toEqual(["job-1"]);
        expect(logged).toHaveBeenCalled();
        logged.mockRestore();
      });
    });
  });

  describe("resolving a mixed selection of jobs and groups", () => {
    beforeEach(() => {
      actions().replaceJobArray([job("job-1"), job("job-2"), job("job-3")]);
      actions().replaceGroupArray([
        { groupID: "group-1", includedJobIDs: ["job-2", "job-3"] },
      ]);
    });

    it("expands a group to the jobs in it", async () => {
      const jobs = await actions().resolveJobObjectsForMixedSelection([
        "job-1",
        "group-1",
      ]);

      expect(jobs.map((j) => j.jobID)).toEqual(["job-1", "job-2", "job-3"]);
    });

    it("does not return a job twice when it is both named and in a group", async () => {
      const jobs = await actions().resolveJobObjectsForMixedSelection([
        "job-2",
        "group-1",
      ]);

      expect(jobs.map((j) => j.jobID)).toEqual(["job-2", "job-3"]);
    });
  });
});
