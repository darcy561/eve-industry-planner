import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import documentLockSlice from "../src/Zustand/documentLockSlice.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../src/Functions/DocumentLock/documentLockCollections.js";

const saveJobsViaApi = vi.fn().mockResolvedValue(undefined);
const saveUserAccountDocument = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/Functions/JobDocuments/saveJobsViaApi.js", () => ({
  saveJobsViaApi: (...args) => saveJobsViaApi(...args),
}));

vi.mock("../src/Functions/Endpoints/Private/userDocument.js", () => ({
  saveUserAccountDocument: (...args) => saveUserAccountDocument(...args),
}));

vi.mock("../src/Components/Edit Job/functions/applyParentChildChanges", () => ({
  default: () => [],
}));

vi.mock("../src/Functions/Shared/repairMissingParentChildRelationships", () => ({
  default: () => [],
}));

vi.mock("../src/Functions/Shared/normaliseParentChildRelationships.js", () => ({
  default: () => [],
}));

vi.mock("../src/Functions/Helper/getAllRelatedJobs", () => ({
  default: () => [],
}));

vi.mock("../src/Events/snackbarEvents", () => ({
  showSnackbarInfo: vi.fn(),
}));

const storeHolder = { current: null };

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => storeHolder.current.getState(),
    setState: (...args) => storeHolder.current.setState(...args),
  },
}));

import closeActiveJob from "../src/Functions/JobPlanner/closeActiveJob.js";

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
    vi.clearAllMocks();
    const job = makeJob();
    storeHolder.current = create((set, get) => ({
      account: {
        isLoggedIn: true,
        sessionID: "sess-a",
        actions: { addLinkedEsiData: vi.fn() },
      },
      applicationSettings: { enableAutomaticJobRecalculation: false },
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

  it("skips API persist without the job lock", async () => {
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      "j1",
      { readOnly: true, lockHeld: false }
    );

    await closeActiveJob(makeJob(), true, {}, {}, {}, null);

    expect(saveJobsViaApi).not.toHaveBeenCalled();
    expect(
      storeHolder.current.getState().jobData.actions.clearPendingJobDocumentWrites
    ).toHaveBeenCalled();
  });

  it("persists when this tab holds the job lock", async () => {
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      "j1",
      { readOnly: false, lockHeld: true }
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
      () => group
    );
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      "j1",
      { readOnly: false, lockHeld: true }
    );
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOB_GROUPS_COLLECTION,
      "g1",
      { readOnly: true, lockHeld: false }
    );

    await closeActiveJob(job, true, {}, {}, {}, null);

    expect(saveJobsViaApi).not.toHaveBeenCalled();
    expect(
      storeHolder.current.getState().jobData.actions.updateModifiedGroups
    ).toHaveBeenCalledWith(expect.anything(), { queuePersist: false });
  });
});
