import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import documentLockSlice from "../../Zustand/documentLockSlice.js";
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

vi.mock("./recalculateJobForNewTotal", () => ({
  default: () => {},
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

const storeHolder = { current: null };

vi.mock("../../Zustand/usersStore.js", () => ({
  default: {
    getState: () => storeHolder.current.getState(),
    setState: (...args) => storeHolder.current.setState(...args),
  },
}));

import closeActiveJob from "./closeActiveJob.js";
import { snackbarSpies } from "../../tests/snackbarHarness.js";

const { showSnackbarInfo, showSnackbarWarning } = snackbarSpies;

function makeJob(id = "j1", groupID = null) {
  return {
    jobID: id,
    name: "Test Job",
    includedInGroup: Boolean(groupID),
    groupID,
    isReadyToSell: false,
    parentJobs: [],
    build: { materials: [], childJobs: {} },
  };
}

describe("closeActiveJob", () => {
  beforeEach(() => {
    const job = makeJob();
    storeHolder.current = create((set, get) => ({
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
          setActiveJobID: vi.fn(),
          updateModifiedGroups: vi.fn(),
          getGroupObject: vi.fn(),
          updateOrAddJobsToJobArray: vi.fn(),
          findJobInJobArray: vi.fn(() => job),
          clearPendingJobDocumentWrites: vi.fn(),
          clearPendingJobGroupWrites: vi.fn(),
        },
      },
      ...documentLockSlice(set, get),
    }));
  });

  // Closing recalculates production against what the parents need, so a
  // quantity someone set by hand can be replaced on the way out. The person
  // closing the job is told, rather than finding out when they reopen it.
  it("says what the recalculation changed on the way out", async () => {
    const job = makeJob();
    const produced = [280, 3440];
    Object.defineProperty(job, "totalQuantityProduced", {
      get: () => produced.shift() ?? 3440,
    });
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
    expect(
      storeHolder.current.getState().jobData.actions.setActiveJobID,
    ).toHaveBeenCalledWith(null);
  });
});
