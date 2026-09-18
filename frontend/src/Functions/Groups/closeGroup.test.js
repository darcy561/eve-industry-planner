import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import documentLockSlice from "../../Zustand/documentLockSlice.js";
import { USER_JOB_GROUPS_COLLECTION } from "../Endpoints/Private/groups.js";

const flushPendingGroupSave = vi.fn().mockResolvedValue(undefined);
const saveJobsViaApi = vi.fn().mockResolvedValue(undefined);

vi.mock("../Debounce/jobGroupsPersistSchedule.js", () => ({
  flushPendingGroupSave: (...args) => flushPendingGroupSave(...args),
}));

vi.mock("../JobDocuments/saveJobsViaApi.js", () => ({
  saveJobsViaApi: (...args) => saveJobsViaApi(...args),
}));

vi.mock("../Shared/normaliseParentChildRelationships.js", () => ({
  default: () => [],
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

import closeActiveGroup from "./closeGroup.js";
import { snackbarSpies } from "../../tests/snackbarHarness.js";

const { showSnackbarWarning } = snackbarSpies;

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
    keepOnlyParentJobs: vi.fn(),
    keepOnlyChildJobs: vi.fn(),
  };
}

describe("closeActiveGroup", () => {
  beforeEach(() => {
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
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOB_GROUPS_COLLECTION,
        "g1",
        { readOnly: true, lockHeld: false },
      );

    await closeActiveGroup([makeJob()]);

    expect(flushPendingGroupSave).not.toHaveBeenCalled();
    expect(saveJobsViaApi).not.toHaveBeenCalled();
    expect(
      storeHolder.current.getState().jobData.actions.clearPendingJobGroupWrites,
    ).toHaveBeenCalledWith("g1");
    expect(
      storeHolder.current.getState().jobData.actions.updateModifiedGroups,
    ).toHaveBeenCalledWith(expect.anything(), { queuePersist: false });
  });

  // The group's changes are applied to the store and its queued write cleared,
  // so the work is on screen and lost at the next reload. Without this the user
  // is told nothing at all.
  it("warns when a signed-in editor could not persist", async () => {
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOB_GROUPS_COLLECTION,
        "g1",
        { readOnly: true, lockHeld: false },
      );

    await closeActiveGroup([makeJob()]);

    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("not saved"),
      8,
    );
  });

  it("persists when this tab holds the group lock", async () => {
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOB_GROUPS_COLLECTION,
        "g1",
        { readOnly: false, lockHeld: true },
      );

    await closeActiveGroup([makeJob()]);

    expect(flushPendingGroupSave).toHaveBeenCalled();
    expect(saveJobsViaApi).toHaveBeenCalled();
    expect(
      storeHolder.current.getState().jobData.actions.updateModifiedGroups,
    ).toHaveBeenCalledWith(expect.anything(), { queuePersist: true });
  });
});
