import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { navigated, search, store, saved, flushed, tracked } = vi.hoisted(
  () => ({
    navigated: [],
    search: { current: {} },
    store: { current: null },
    saved: { batches: [] },
    flushed: { count: 0 },
    tracked: { events: [] },
  }),
);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => (options) => navigated.push(options),
  useSearch: () => search.current,
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../../Functions/Debounce/jobGroupsPersistSchedule.js", () => ({
  flushPendingGroupSave: async () => {
    flushed.count += 1;
  },
}));

vi.mock("../../../Functions/JobDocuments/saveJobsViaApi.js", () => ({
  saveJobsViaApi: async (jobs) => {
    saved.batches.push(jobs.map((job) => job.jobID));
  },
}));

vi.mock("../../../analytics/trackAppEvent", () => ({
  trackAppEvent: (event) => tracked.events.push(event),
}));

vi.mock("../../../Components/loadingPage", () => ({
  LoadingPage: () => null,
}));

const { default: NewGroupPage } = await import("./newGroupPage.jsx");
const { default: Job } = await import("../../../Classes/job.js");
const { AppEvent } = await import("../../../analytics/appEventNames");

const TRITANIUM = 34;
const PYERITE = 35;

/**
 * A job carrying the two link shapes this page edits: `parentJobs`, a flat list
 * of job IDs, and `build.childJobs`, keyed by material type ID.
 *
 * `itemID` is what the job produces, and a parent lists a child under exactly
 * that key — so a child wired in under TRITANIUM must be built with
 * `itemID: TRITANIUM` for the tree to be the shape the app makes.
 *
 * A job carries a `childJobs` key for each of its current materials, so listing
 * fewer materials is how a tree that has drifted off its blueprint is modelled.
 *
 * @param {string} jobID
 * @param {{itemID?: number, parents?: string[], children?: Record<number, string[]>, materials?: number[]}} [links]
 * @returns {Job}
 */
function makeJob(
  jobID,
  {
    itemID = 587,
    parents = [],
    children = {},
    materials = [TRITANIUM, PYERITE],
  } = {},
) {
  const names = { [TRITANIUM]: "Tritanium", [PYERITE]: "Pyerite" };
  return new Job({
    jobID,
    itemID,
    jobType: 1,
    name: `Job ${jobID}`,
    itemsProducedPerRun: 1,
    parentJobs: [...parents],
    build: {
      materials: materials.map((typeID) => ({
        typeID,
        name: names[typeID],
        quantity: 100,
      })),
      childJobs: Object.fromEntries(
        materials.map((typeID) => [typeID, [...(children[typeID] ?? [])]]),
      ),
    },
  });
}

/** The Job constructor reads the store, so one exists before any job is built. */
function emptyStore() {
  return {
    account: { isLoggedIn: true, accountID: "acc-1" },
    jobData: { jobArray: [], actions: {}, groups: [] },
  };
}

function seed(jobs, { isLoggedIn = true } = {}) {
  const byID = new Map(jobs.map((job) => [job.jobID, job]));
  const groups = [];
  store.current = {
    account: { isLoggedIn, accountID: "acc-1" },
    jobData: {
      jobArray: jobs,
      actions: {
        findJobInJobArray: (id) => byID.get(id) ?? null,
        addGroupToGroupArray: (group) => groups.push(group),
      },
      groups,
    },
  };
  return groups;
}

function select(...jobIDs) {
  search.current = { includes: jobIDs.join(",") };
}

/** Runs the mount effect through its polling race to the navigation. */
async function renderPage() {
  render(<NewGroupPage />);
  await vi.advanceTimersByTimeAsync(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  navigated.length = 0;
  saved.batches.length = 0;
  tracked.events.length = 0;
  flushed.count = 0;
  search.current = {};
  store.current = emptyStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NewGroupPage", () => {
  describe("creating the group", () => {
    it("puts the selected jobs into a new group", async () => {
      const a = makeJob("job-a");
      const b = makeJob("job-b");
      const groups = seed([a, b]);
      select("job-a", "job-b");

      await renderPage();

      expect(groups).toHaveLength(1);
      expect([...groups[0].includedJobIDs].sort()).toEqual(["job-a", "job-b"]);
    });

    it("assigns every selected job to the new group", async () => {
      const a = makeJob("job-a");
      const b = makeJob("job-b");
      const groups = seed([a, b]);
      select("job-a", "job-b");

      await renderPage();

      expect(a.groupID).toBe(groups[0].groupID);
      expect(b.groupID).toBe(groups[0].groupID);
    });

    it("navigates to the group it created", async () => {
      const a = makeJob("job-a");
      const groups = seed([a]);
      select("job-a");

      await renderPage();

      expect(navigated).toEqual([
        {
          to: "/group/$groupID",
          params: { groupID: groups[0].groupID },
        },
      ]);
    });

    it("creates an empty group when nothing is selected", async () => {
      const groups = seed([]);
      search.current = {};

      await renderPage();

      expect(groups).toHaveLength(1);
      expect([...groups[0].includedJobIDs]).toEqual([]);
      expect(navigated).toHaveLength(1);
    });

    it("ignores a selected id that matches no job", async () => {
      const a = makeJob("job-a");
      const groups = seed([a]);
      select("job-a", "job-missing");

      await renderPage();

      expect([...groups[0].includedJobIDs]).toEqual(["job-a"]);
    });

    it("records that a group was created", async () => {
      seed([]);
      search.current = {};

      await renderPage();

      expect(tracked.events).toEqual([AppEvent.NEW_JOB_GROUP]);
    });
  });

  describe("severing links to jobs left outside the group", () => {
    it("removes the grouped job from an outside parent's child jobs", async () => {
      const grouped = makeJob("job-child", {
        itemID: TRITANIUM,
        parents: ["job-parent"],
      });
      const parent = makeJob("job-parent", {
        children: { [TRITANIUM]: ["job-child", "job-other"] },
      });
      seed([grouped, parent]);
      select("job-child");

      await renderPage();

      expect(parent.build.childJobs[TRITANIUM]).toEqual(["job-other"]);
    });

    it("saves the outside parent whose links it changed", async () => {
      const grouped = makeJob("job-child", {
        itemID: TRITANIUM,
        parents: ["job-parent"],
      });
      const parent = makeJob("job-parent", {
        children: { [TRITANIUM]: ["job-child"] },
      });
      seed([grouped, parent]);
      select("job-child");

      await renderPage();

      expect(saved.batches.flat()).toContain("job-parent");
    });

    it("leaves a parent that is inside the group untouched", async () => {
      const grouped = makeJob("job-child", {
        itemID: TRITANIUM,
        parents: ["job-parent"],
      });
      const parent = makeJob("job-parent", {
        children: { [TRITANIUM]: ["job-child"] },
      });
      seed([grouped, parent]);
      select("job-child", "job-parent");

      await renderPage();

      expect(parent.build.childJobs[TRITANIUM]).toEqual(["job-child"]);
    });

    it("keeps only the parent links that are inside the group", async () => {
      const grouped = makeJob("job-child", {
        itemID: TRITANIUM,
        parents: ["job-inside", "job-outside"],
      });
      const inside = makeJob("job-inside", {
        children: { [TRITANIUM]: ["job-child"] },
      });
      const outside = makeJob("job-outside", {
        children: { [TRITANIUM]: ["job-child"] },
      });
      seed([grouped, inside, outside]);
      select("job-child", "job-inside");

      await renderPage();

      expect(grouped.parentJobs).toEqual(["job-inside"]);
    });

    it("removes an outside child from the grouped job's child jobs", async () => {
      const grouped = makeJob("job-parent", {
        children: { [TRITANIUM]: ["job-inside", "job-outside"] },
      });
      const inside = makeJob("job-inside", {
        itemID: TRITANIUM,
        parents: ["job-parent"],
      });
      const outside = makeJob("job-outside", {
        itemID: TRITANIUM,
        parents: ["job-parent"],
      });
      seed([grouped, inside, outside]);
      select("job-parent", "job-inside");

      await renderPage();

      expect(grouped.build.childJobs[TRITANIUM]).toEqual(["job-inside"]);
    });

    it("drops only this job from an outside child's parents", async () => {
      const grouped = makeJob("job-parent", {
        children: { [TRITANIUM]: ["job-outside"] },
      });
      const outside = makeJob("job-outside", {
        itemID: TRITANIUM,
        parents: ["job-parent", "job-unrelated"],
      });
      seed([grouped, outside]);
      select("job-parent");

      await renderPage();

      expect(outside.parentJobs).toEqual(["job-unrelated"]);
    });

    it("passes over a parent whose materials no longer list this job", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      // The parent needs Pyerite, but the grouped job produces Tritanium — the
      // drift a blueprint change leaves behind.
      const grouped = makeJob("job-child", {
        itemID: TRITANIUM,
        parents: ["job-parent"],
      });
      const parent = makeJob("job-parent", {
        materials: [PYERITE],
        children: { [PYERITE]: ["job-other"] },
      });
      seed([grouped, parent]);
      select("job-child");

      await renderPage();

      expect(parent.build.childJobs[PYERITE]).toEqual(["job-other"]);
      expect(saved.batches.flat()).not.toContain("job-parent");
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("saves the outside child whose parents it changed", async () => {
      const grouped = makeJob("job-parent", {
        children: { [TRITANIUM]: ["job-outside"] },
      });
      const outside = makeJob("job-outside", {
        itemID: TRITANIUM,
        parents: ["job-parent"],
      });
      seed([grouped, outside]);
      select("job-parent");

      await renderPage();

      expect(saved.batches.flat()).toContain("job-outside");
    });

    it("severs links across every material, not just the first", async () => {
      const grouped = makeJob("job-parent", {
        children: {
          [TRITANIUM]: ["job-outside-a"],
          [PYERITE]: ["job-outside-b"],
        },
      });
      const outsideA = makeJob("job-outside-a", {
        itemID: TRITANIUM,
        parents: ["job-parent"],
      });
      const outsideB = makeJob("job-outside-b", {
        itemID: PYERITE,
        parents: ["job-parent"],
      });
      seed([grouped, outsideA, outsideB]);
      select("job-parent");

      await renderPage();

      expect(grouped.build.childJobs[TRITANIUM]).toEqual([]);
      expect(grouped.build.childJobs[PYERITE]).toEqual([]);
      expect(outsideA.parentJobs).toEqual([]);
      expect(outsideB.parentJobs).toEqual([]);
    });
  });

  describe("persisting the changes", () => {
    it("flushes a pending group save before saving jobs", async () => {
      const a = makeJob("job-a");
      seed([a]);
      select("job-a");

      await renderPage();

      expect(flushed.count).toBe(1);
      expect(saved.batches).toHaveLength(1);
    });

    it("saves the grouped jobs", async () => {
      const a = makeJob("job-a");
      const b = makeJob("job-b");
      seed([a, b]);
      select("job-a", "job-b");

      await renderPage();

      expect(saved.batches.flat().sort()).toEqual(["job-a", "job-b"]);
    });

    it("saves nothing when signed out", async () => {
      const a = makeJob("job-a");
      seed([a], { isLoggedIn: false });
      select("job-a");

      await renderPage();

      expect(saved.batches).toEqual([]);
      expect(flushed.count).toBe(0);
    });
  });

  describe("when it cannot finish", () => {
    it("returns to the job planner", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      seed([]);
      // A selected id that never appears in jobArray leaves the readiness
      // poll unsatisfied until the timeout rejects the race.
      search.current = { includes: "job-never-arrives" };

      render(<NewGroupPage />);
      await vi.advanceTimersByTimeAsync(10000);

      expect(navigated).toEqual([{ to: "/jobplanner" }]);
      consoleError.mockRestore();
    });
  });
});
