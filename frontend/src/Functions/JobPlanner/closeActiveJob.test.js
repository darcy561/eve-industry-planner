import { beforeEach, describe, expect, it, vi } from "vitest";
import { freeze } from "immer";
import { standUpStore, storeHolder } from "../../tests/rawStoreHarness.js";
import documentLockSlice from "../../Zustand/documentLockSlice.js";
import editSessionSlice from "../../Zustand/editSessionSlice.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../DocumentLock/documentLockCollections.js";

const saveJobsViaApi = vi.fn().mockResolvedValue(undefined);
const saveUserAccountDocument = vi.fn().mockResolvedValue(undefined);

vi.mock("../JobDocuments/saveJobsViaApi.js", () => ({
  saveJobsViaApi: (...args) => saveJobsViaApi(...args),
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

// The real one rebuilds the job's setups to make the quantity asked for, which
// is how the close can see a job's output change under it. Only the case about
// that needs it to do anything.
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
import { jobLens } from "../../Components/Edit Job/Edit Job Hooks/jobLens.js";
import { snackbarSpies } from "../../tests/snackbarHarness.js";

const { showSnackbarInfo, showSnackbarWarning } = snackbarSpies;

/** The close only persists when this session holds the job's lock. */
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

/** The store the close reads: the job in the planner, and nothing watching. */
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
    // The close ends the edit session as well, so the store it reads has to
    // hold one.
    ...editSessionSlice(set, get),
  }));
}

describe("closeActiveJob", () => {
  beforeEach(() => {
    resizes.current = false;
    seedStore();
  });

  // Closing recalculates production against what the parents need, so a
  // quantity someone set by hand can be replaced on the way out. The person
  // closing the job is told, rather than finding out when they reopen it.
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

  // Only the job the reader had open has a log behind it. Everything else a
  // close writes was changed outside the editor, so its write has to carry the
  // whole document rather than the edited job's fields.
  it("hands the save the edited job's changes and nothing else's", async () => {
    const job = makeJob();
    const child = makeJob("j2");
    const changes = [
      { jobID: job.jobID, patches: [{ op: "replace", path: ["name"] }] },
    ];
    holdTheJobLock(job.jobID);

    await closeActiveJob(job, true, { 34: child }, {}, {}, null, changes);

    const [written, sentChanges] = saveJobsViaApi.mock.calls.at(-1);
    expect(written.map((held) => held.jobID)).toContain(child.jobID);
    expect(sentChanges).toEqual({ [job.jobID]: changes });
  });

  // `entriesFor` answers an empty list for a job the reader changed nothing on,
  // and an empty log is not the same claim as no log: it would queue the job as
  // "these fields changed, and there are none of them".
  it("writes the whole document when the edited job's log is empty", async () => {
    holdTheJobLock("j1");

    await closeActiveJob(makeJob(), true, {}, {}, {}, null, []);

    expect(saveJobsViaApi).toHaveBeenCalledWith(expect.any(Array), undefined);
  });

  it("writes the whole document when the close recorded no changes", async () => {
    holdTheJobLock("j1");

    await closeActiveJob(makeJob(), true, {}, {}, {}, null);

    expect(saveJobsViaApi).toHaveBeenCalledWith(expect.any(Array), undefined);
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

    expect(saveJobsViaApi).not.toHaveBeenCalled();
    expect(
      storeHolder.current.getState().jobData.actions
        .clearPendingJobDocumentWrites,
    ).toHaveBeenCalled();
  });

  // The edits are applied to the store and the queued writes cleared either way,
  // so a close that cannot persist leaves the work on screen and loses it at the
  // next reload. Without this the user is told nothing at all.
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

  // The summary reports what was saved, so following a refusal with it would
  // contradict the warning the refusal already raised.
  it("does not claim a refused write saved", async () => {
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOBS_COLLECTION,
        "j1",
        { readOnly: false, lockHeld: true },
      );
    saveJobsViaApi.mockResolvedValueOnce("conflict");

    await closeActiveJob(makeJob(), true, {}, {}, {}, null);

    expect(saveJobsViaApi).toHaveBeenCalled();
    expect(showSnackbarInfo).not.toHaveBeenCalled();
  });

  // A lock taken since this tab last checked, and a write that simply failed,
  // save no more than a refused one does. Reporting the adjustment summary for
  // any of them tells the reader a figure was stored when it was not.
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
      saveJobsViaApi.mockResolvedValueOnce(outcome);

      await closeActiveJob(makeJob(), true, {}, {}, {}, null);

      expect(saveJobsViaApi).toHaveBeenCalled();
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

    expect(saveJobsViaApi).toHaveBeenCalled();
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

    expect(saveJobsViaApi).not.toHaveBeenCalled();
    expect(
      storeHolder.current.getState().jobData.actions.updateModifiedGroups,
    ).toHaveBeenCalledWith(expect.anything(), { queuePersist: false });
  });

  // A job the store no longer holds is one that left while the editor had it
  // open — deleted by another member. Writing it back would recreate a document
  // somebody else removed, from a copy taken before they removed it.
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

    expect(saveJobsViaApi).not.toHaveBeenCalled();
    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("removed while you had it open"),
      expect.any(Number),
    );
  });
});

// The job the editor hands over is frozen — closing is the one path that
// rewrites a job in place, and it works on its own copy. Without that, saving a
// grouped job ready for sale throws where it sets the planner flag.
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
    // Built the way the page builds it, so the fixture cannot drift from what
    // the editor actually hands over.
    return { document, job: jobLens(document) };
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

// The session is a slice of the store, so it outlives the page. A job left in it
// after a save is the one the next open reads instead of loading — the reader is
// shown what they had before they saved, and saving again writes it back.
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
