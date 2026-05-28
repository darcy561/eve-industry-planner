import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import documentLockSlice from "../src/Zustand/documentLockSlice.js";
import { docLockScopeKey } from "../src/Functions/DocumentLock/documentLockScope.js";
import { USER_JOB_GROUPS_COLLECTION } from "../src/Functions/Endpoints/Pirivate/groups.js";

const flushPendingGroupSave = vi.fn().mockResolvedValue(undefined);
const saveJobsViaApi = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/Functions/Debounce/jobGroupsPersistSchedule.js", () => ({
  flushPendingGroupSave: (...args) => flushPendingGroupSave(...args),
}));

vi.mock("../src/Functions/JobDocuments/saveJobsViaApi.js", () => ({
  saveJobsViaApi: (...args) => saveJobsViaApi(...args),
}));

vi.mock("../src/Functions/Shared/normalizeParentChildRelationships.js", () => ({
  default: () => [],
}));

const storeHolder = { current: null };

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => storeHolder.current.getState(),
    setState: (...args) => storeHolder.current.setState(...args),
  },
}));

import closeActiveGroup from "../src/Functions/Groups/closeGroup.js";

function makeGroup(id = "g1") {
  return {
    groupID: id,
    includedJobIDs: new Set(),
    updateGroupData: vi.fn(),
  };
}

function makeJob(id = "j1") {
  return {
    jobID: id,
    removeParentJobsNotIncludedInInput: vi.fn(),
    removeChildJobsNotIncludedInInputFromAllMaterials: vi.fn(),
  };
}

describe("closeActiveGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const group = makeGroup();
    const job = makeJob();
    group.includedJobIDs.add(job.jobID);

    storeHolder.current = create((set, get) => ({
      account: { isLoggedIn: true, sessionID: "sess-a" },
      jobData: {
        jobArray: [job],
        groupArray: [group],
        pendingJobGroupWrites: [],
        actions: {
          clearActiveGroupID: vi.fn(),
          clearMultiSelect: vi.fn(),
          getActiveGroupObject: () => group,
          updateOrAddJobsToJobArray: vi.fn(),
          updateModifiedGroups: vi.fn(),
          clearPendingJobGroupWrites: vi.fn(),
        },
      },
      ...documentLockSlice(set, get),
    }));
  });

  it("skips API persist when this tab does not hold the group lock", async () => {
    const k = docLockScopeKey(USER_JOB_GROUPS_COLLECTION, "g1");
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOB_GROUPS_COLLECTION,
      "g1",
      { readOnly: true, lockHeld: false }
    );

    await closeActiveGroup([makeJob()]);

    expect(flushPendingGroupSave).not.toHaveBeenCalled();
    expect(saveJobsViaApi).not.toHaveBeenCalled();
    expect(
      storeHolder.current.getState().jobData.actions.clearPendingJobGroupWrites
    ).toHaveBeenCalledWith("g1");
    expect(
      storeHolder.current.getState().jobData.actions.updateModifiedGroups
    ).toHaveBeenCalledWith(expect.anything(), { queuePersist: false });
  });

  it("persists when this tab holds the group lock", async () => {
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOB_GROUPS_COLLECTION,
      "g1",
      { readOnly: false, lockHeld: true }
    );

    await closeActiveGroup([makeJob()]);

    expect(flushPendingGroupSave).toHaveBeenCalled();
    expect(saveJobsViaApi).toHaveBeenCalled();
    expect(
      storeHolder.current.getState().jobData.actions.updateModifiedGroups
    ).toHaveBeenCalledWith(expect.anything(), { queuePersist: true });
  });
});
