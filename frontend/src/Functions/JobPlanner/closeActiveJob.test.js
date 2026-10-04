import { beforeEach, describe, expect, it, vi } from "vitest";
import { freeze } from "immer";
import { standUpStore, storeHolder } from "../../tests/rawStoreHarness.js";
import documentLockSlice from "../../Zustand/documentLockSlice.js";
import editSessionSlice from "../../Zustand/editSessionSlice.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../DocumentLock/documentLockCollections.js";

const saveJobsAsOneChange = vi.fn().mockResolvedValue(undefined);
const saveUserAccountDocument = vi.fn().mockResolvedValue(undefined);

vi.mock("../JobDocuments/saveJobsViaApi.js", () => ({
  saveJobsAsOneChange: (...args) => saveJobsAsOneChange(...args),
}));

vi.mock("../Endpoints/Private/userDocument.js", () => ({
  saveUserAccountDocument: (...args) => saveUserAccountDocument(...args),
}));

vi.mock("../../Components/Edit Job/functions/applyParentChildChanges", () => ({
  default: () => [],
}));

vi.mock("../Shared/repairMissingParentChildRelationships", () => ({
  default: () => [],
}));

vi.mock("../Shared/normaliseParentChildRelationships.js", () => ({
  default: () => [],
}));

vi.mock("../Helper/getAllRelatedJobs", () => ({
  default: () => [],
}));

const shakerAdjustments = { current: [] };
const resizes = { current: false };

vi.mock("./recalculateJobForNewTotal", () => ({
  default: (job, requiredQuantity) => {
    if (!resizes.current) return;
    job.itemsProducedPerRun = requiredQuantity;
  },
}));

vi.mock("../Helper/materialTreeShaker", () => ({
  default: (jobs, recalculate) => {
    const ids = new Set();
    for (const adjustment of shakerAdjustments.current) {
      recalculate(adjustment.job, adjustment.required);
      ids.add(adjustment.job.jobID);
    }
    return ids;
  },
}));

vi.mock("../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../Zustand/usersStore.js", async () => {
  const { rawStoreMock } = await import("../../tests/rawStoreHarness.js");
  return rawStoreMock();
});

import closeActiveJob from "./closeActiveJob.js";
import { snackbarSpies } from "../../tests/snackbarHarness.js";

const { showSnackbarInfo, showSnackbarWarning } = snackbarSpies;

function holdTheJobLock(jobID) {
  storeHolder.current
    .getState()
    .documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      jobID,
      {
        readOnly: false,
        lockHeld: true,
      },
    );
}

function makeJob(id = "j1", groupID = null) {
  return {
    jobID: id,
    name: "Test Job",
    includedInGroup: Boolean(groupID),
    groupID,
    isReadyToSell: false,
    parentJobs: [],
    itemsProducedPerRun: 280,
    build: {
      materials: {},
      childJobs: {},
      setup: { "setup-1": { id: "setup-1", runCount: 1, jobCount: 1 } },
    },
  };
}

function seedStore() {
  const job = makeJob();
  standUpStore((set, get) => ({
    account: {
      isLoggedIn: true,
      sessionID: "sess-a",
      actions: { addLinkedEsiData: vi.fn() },
    },
    applicationSettings: {
      enableAutomaticJobRecalculation: false,
      actions: { getCurrentLocale: () => "en-GB" },
    },
    jobData: {
      jobArray: [job],
      groupArray: [],
      actions: {
        updateModifiedGroups: vi.fn(),
        getGroupObject: vi.fn(),
        updateOrAddJobsToJobArray: vi.fn(),
        findJobInJobArray: vi.fn(() => job),
        clearPendingJobDocumentWrites: vi.fn(),
        clearPendingJobGroupWrites: vi.fn(),
      },
    },
    ...documentLockSlice(set, get),

    ...editSessionSlice(set, get),
  }));
}

describe("closeActiveJob", () => {
  beforeEach(() => {
    resizes.current = false;
    seedStore();
  });

  it("says what the recalculation changed on the way out", async () => {
    const job = makeJob();
    resizes.current = true;
    shakerAdjustments.current = [{ job, required: 3440 }];
    storeHolder.current.setState((state) => ({
      applicationSettings: {
        ...state.applicationSettings,
        enableAutomaticJobRecalculation: true,
      },
    }));
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOBS_COLLECTION,
        "j1",
        {
          readOnly: false,
          lockHeld: true,
        },
      );

    await closeActiveJob(job, true, {}, {}, {}, null);

    expect(showSnackbarInfo).toHaveBeenCalledWith(
      "Test Job updated — now making 3,440",
      5,
    );
    shakerAdjustments.current = [];
  });

  it("hands the save the edited job's changes and nothing else's", async () => {
    const job = makeJob();
    const child = makeJob("j2");
    const changes = [
      { jobID: job.jobID, patches: [{ op: "replace", path: ["name"] }] },
    ];
    holdTheJobLock(job.jobID);

    await closeActiveJob(job, true, { 34: child }, {}, {}, null, changes);

    const [written, sentChanges] = saveJobsAsOneChange.mock.calls.at(-1);
    expect(written.map((held) => held.jobID)).toContain(child.jobID);
    expect(sentChanges).toEqual({ [job.jobID]: changes });
  });

  it("writes the whole document when the edited job's log is empty", async () => {
    holdTheJobLock("j1");

    await closeActiveJob(makeJob(), true, {}, {}, {}, null, []);

    expect(saveJobsAsOneChange).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
    );
  });

  it("writes the whole document when the close recorded no changes", async () => {
    holdTheJobLock("j1");

    await closeActiveJob(makeJob(), true, {}, {}, {}, null);

    expect(saveJobsAsOneChange).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
    );
  });

  it("skips API persist without the job lock", async () => {
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOBS_COLLECTION,
        "j1",
        { readOnly: true, lockHeld: false },
      );

    await closeActiveJob(makeJob(), true, {}, {}, {}, null);

    expect(saveJobsAsOneChange).not.toHaveBeenCalled();
    expect(
      storeHolder.current.getState().jobData.actions
        .clearPendingJobDocumentWrites,
    ).toHaveBeenCalled();
  });

  it("warns when a signed-in editor could not persist", async () => {
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOBS_COLLECTION,
        "j1",
        { readOnly: true, lockHeld: false },
      );

    await closeActiveJob(makeJob(), true, {}, {}, {}, null);

    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("not saved"),
      8,
    );
    expect(showSnackbarInfo).not.toHaveBeenCalled();
  });

  it("does not claim a refused write saved", async () => {
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOBS_COLLECTION,
        "j1",
        { readOnly: false, lockHeld: true },
      );
    saveJobsAsOneChange.mockResolvedValueOnce("conflict");

    await closeActiveJob(makeJob(), true, {}, {}, {}, null);

    expect(saveJobsAsOneChange).toHaveBeenCalled();
    expect(showSnackbarInfo).not.toHaveBeenCalled();
  });

  it.each([["locked"], ["failed"]])(
    "does not claim a %s write saved",
    async (outcome) => {
      storeHolder.current
        .getState()
        .documentLock.actions.patchDocumentLockForScope(
          USER_JOBS_COLLECTION,
          "j1",
          { readOnly: false, lockHeld: true },
        );
      saveJobsAsOneChange.mockResolvedValueOnce(outcome);

      await closeActiveJob(makeJob(), true, {}, {}, {}, null);

      expect(saveJobsAsOneChange).toHaveBeenCalled();
      expect(showSnackbarInfo).not.toHaveBeenCalled();
    },
  );

  it("persists when this tab holds the job lock", async () => {
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOBS_COLLECTION,
        "j1",
        { readOnly: false, lockHeld: true },
      );

    await closeActiveJob(makeJob(), true, {}, {}, {}, null);

    expect(saveJobsAsOneChange).toHaveBeenCalled();
  });

  it("skips job persist when grouped but group lock is not held", async () => {
    const job = makeJob("j1", "g1");
    const group = {
      groupID: "g1",
      addJobsToGroup: vi.fn(),
    };
    storeHolder.current.getState().jobData.actions.getGroupObject = vi.fn(
      () => group,
    );
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOBS_COLLECTION,
        "j1",
        { readOnly: false, lockHeld: true },
      );
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOB_GROUPS_COLLECTION,
        "g1",
        { readOnly: true, lockHeld: false },
      );

    await closeActiveJob(job, true, {}, {}, {}, null);

    expect(saveJobsAsOneChange).not.toHaveBeenCalled();
    expect(
      storeHolder.current.getState().jobData.actions.updateModifiedGroups,
    ).toHaveBeenCalledWith(expect.anything(), { queuePersist: false });
  });

  it("does not write back a job that was deleted while it was open", async () => {
    const job = makeJob();
    storeHolder.current.setState((state) => ({
      jobData: {
        ...state.jobData,
        jobArray: [],
        actions: { ...state.jobData.actions, findJobInJobArray: () => null },
      },
    }));

    await closeActiveJob(job, true, {}, {}, {}, null);

    expect(saveJobsAsOneChange).not.toHaveBeenCalled();
    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("removed while you had it open"),
      expect.any(Number),
    );
  });
});

describe("a close the server refused", () => {
  const group = { groupID: "g1", addJobsToGroup: vi.fn() };
  const esiToLink = {
    marketOrders: { add: [{ orderID: 1 }], remove: [] },
  };

  beforeEach(() => {
    resizes.current = false;
    seedStore();
    group.addJobsToGroup.mockReset();
    saveUserAccountDocument.mockClear();
    storeHolder.current.getState().jobData.actions.getGroupObject = vi.fn(
      () => group,
    );
    holdTheJobLock("j1");
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOB_GROUPS_COLLECTION,
        "g1",
        { readOnly: false, lockHeld: true },
      );
  });

  const close = () =>
    closeActiveJob(
      makeJob("j1", "g1"),
      true,
      { 34: makeJob("j2", "g1") },
      esiToLink,
      {},
      null,
    );

  it.each([["conflict"], ["locked"], ["failed"]])(
    "writes neither the group nor the ESI links when %s",
    async (outcome) => {
      saveJobsAsOneChange.mockResolvedValueOnce(outcome);

      await close();

      const { jobData, account } = storeHolder.current.getState();
      expect(group.addJobsToGroup).not.toHaveBeenCalled();
      expect(jobData.actions.updateModifiedGroups).not.toHaveBeenCalled();
      expect(account.actions.addLinkedEsiData).not.toHaveBeenCalled();
      expect(saveUserAccountDocument).not.toHaveBeenCalled();
    },
  );

  it("writes the group and the ESI links once the close landed", async () => {
    saveJobsAsOneChange.mockResolvedValueOnce("saved");

    await close();

    const { jobData, account } = storeHolder.current.getState();
    expect(group.addJobsToGroup).toHaveBeenCalledWith([
      expect.objectContaining({ jobID: "j2" }),
    ]);
    expect(jobData.actions.updateModifiedGroups).toHaveBeenCalledWith(group, {
      queuePersist: true,
    });
    expect(account.actions.addLinkedEsiData).toHaveBeenCalled();
    expect(saveUserAccountDocument).toHaveBeenCalled();
  });

  it("sends the new job with the close rather than after it", async () => {
    saveJobsAsOneChange.mockResolvedValueOnce("saved");

    await close();

    const [written] = saveJobsAsOneChange.mock.calls.at(-1);
    expect(written.map((job) => job.jobID)).toEqual(["j1", "j2"]);
  });
});

describe("closing a job the editor froze", () => {
  beforeEach(() => {
    resizes.current = false;
    seedStore();
  });

  const frozenJob = () => {
    const document = freeze(
      {
        jobID: "j1",
        name: "Test Job",
        includedInGroup: true,
        groupID: "g1",
        isReadyToSell: true,
        displayOnPlanner: false,
        parentJobs: [],
        build: { materials: {}, childJobs: {} },
      },
      true,
    );

    return { document, job: document };
  };

  it("saves without writing into what the editor holds", async () => {
    const { document, job } = frozenJob();

    await expect(
      closeActiveJob(job, true, {}, {}, {}, null),
    ).resolves.toBeUndefined();

    expect(document.displayOnPlanner).toBe(false);
    expect(Object.isFrozen(document)).toBe(true);
  });
});

describe("what the save leaves behind", () => {
  beforeEach(() => {
    resizes.current = false;
    seedStore();
  });

  const sessionHolds = () => {
    const { draft, activeJobID } = storeHolder.current.getState().editSession;
    return {
      jobs: Object.keys(draft.base),
      log: draft.log.length,
      activeJobID,
    };
  };

  const openAndChange = () => {
    const { actions } = storeHolder.current.getState().editSession;
    actions.openJob("j1", { jobID: "j1", name: "Test Job", jobStatus: 1 });
    actions.run({
      name: "move to the next stage",
      recipe: (job) => {
        job.jobStatus = 2;
      },
    });
  };

  it("keeps nothing once the job is saved", async () => {
    openAndChange();

    await closeActiveJob(makeJob(), true, {}, {}, {}, null);

    expect(sessionHolds()).toEqual({ jobs: [], log: 0, activeJobID: null });
  });

  it("keeps nothing when there was nothing to save", async () => {
    openAndChange();

    await closeActiveJob(makeJob(), false, {}, {}, {}, null);

    expect(sessionHolds()).toEqual({ jobs: [], log: 0, activeJobID: null });
  });

  it("keeps nothing when the job went while it was open", async () => {
    openAndChange();
    storeHolder.current.getState().jobData.actions.findJobInJobArray = () =>
      null;

    await closeActiveJob(makeJob(), true, {}, {}, {}, null);

    expect(sessionHolds()).toEqual({ jobs: [], log: 0, activeJobID: null });
  });
});
