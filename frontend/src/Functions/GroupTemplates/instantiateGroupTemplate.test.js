import { beforeEach, describe, expect, it, vi } from "vitest";
import { standUpStore } from "../../tests/rawStoreHarness.js";

const order = [];
const saveJobsViaApi = vi.fn(async () => {
  order.push("save");
  return "saved";
});
const mergeJobs = vi.fn(async () => {
  order.push("merge");
});

vi.mock("../Job/sync/saveJobsViaApi.js", () => ({
  saveJobsViaApi: (...args) => saveJobsViaApi(...args),
}));

vi.mock("../Job/changes/mergeJobs", () => ({
  default: (...args) => mergeJobs(...args),
}));

vi.mock("../Job/building/buildJob", async () => {
  const { jobFromDocument } = await import("../Job/jobDocument.js");
  return {
    buildJob: vi.fn(async ({ itemID }) =>
      jobFromDocument({ jobID: `built-${itemID}`, itemID }),
    ),
  };
});

vi.mock("../../Components/Edit Job/Edit Job Hooks/jobSelectors", () => ({
  totalQuantityProduced: () => 2,
}));

vi.mock("../Shared/normaliseParentChildRelationships", () => ({
  default: () => [],
}));

vi.mock("../Shared/getMissingESIData", () => ({
  default: async () => ({ requestedSystemIndexes: [] }),
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { rawStoreMock } = await import("../../tests/rawStoreHarness.js");
  return rawStoreMock();
});

const { instantiateGroupTemplate } =
  await import("./instantiateGroupTemplate.js");

function standUpPlanner({ isLoggedIn }) {
  standUpStore(() => ({
    account: { isLoggedIn },
    worldData: { actions: { addSystemIndex: vi.fn() } },
    jobData: {
      actions: {
        updateOrAddJobsToJobArray: vi.fn(),
        addGroupToGroupArray: vi.fn(),
        updateModifiedGroups: vi.fn(),
        queueJobGroupWritesAndSchedule: vi.fn(),
        getActiveGroupObject: vi.fn(),
      },
    },
  }));
}

function activeGroup() {
  return {
    groupID: "group-1",
    includedJobIDs: ["existing"],
    addJobsToGroup(jobs) {
      this.includedJobIDs.push(...jobs.map((job) => job.jobID));
    },
  };
}

const payload = {
  jobs: [{ templateJobId: "t1", itemID: 587, desiredTotalQuantity: 2 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
});

describe("applying a template to the active group", () => {
  it("saves the jobs it built before merging them with the group's own", async () => {
    standUpPlanner({ isLoggedIn: true });

    await instantiateGroupTemplate({
      payload,
      mode: "activeGroup",
      queryClient: null,
      activeGroupOverride: activeGroup(),
    });

    expect(order).toEqual(["save", "merge"]);
    expect(saveJobsViaApi.mock.calls[0][0].map((job) => job.jobID)).toEqual([
      "built-587",
    ]);
    expect(mergeJobs.mock.calls[0][0]).toEqual(["existing", "built-587"]);
  });

  it("saves nothing while signed out", async () => {
    standUpPlanner({ isLoggedIn: false });

    await instantiateGroupTemplate({
      payload,
      mode: "activeGroup",
      queryClient: null,
      activeGroupOverride: activeGroup(),
    });

    expect(saveJobsViaApi).not.toHaveBeenCalled();
    expect(mergeJobs).toHaveBeenCalledOnce();
  });
});
