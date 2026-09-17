import { beforeEach, describe, expect, it, vi } from "vitest";

import { activePlannerStoreState } from "../../tests/utils.js";

const storeState = activePlannerStoreState();
const clearActiveGroupIfMatches = vi.fn();
const clearPendingJobGroupWrites = vi.fn();
const replaceGroupArray = vi.fn();
storeState.jobData.actions.clearActiveGroupIfMatches =
  clearActiveGroupIfMatches;
storeState.jobData.actions.clearPendingJobGroupWrites =
  clearPendingJobGroupWrites;
storeState.jobData.actions.replaceGroupArray = replaceGroupArray;

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});
const releaseJobsAfterGroupRemoved = vi.fn();
vi.mock("../../Functions/Groups/releaseJobsAfterGroupRemoved.js", () => ({
  releaseJobsAfterGroupRemoved: (...args) =>
    releaseJobsAfterGroupRemoved(...args),
}));

const { handleUserJobGroupDelete } = await import("./userJobGroupsDocument.js");

// A delete has no stamp of its own, which is why this path used to reach for
// Date.now() — and why one comparison then decided between a browser clock and a
// server clock. The delivery's position is something a delete carries.
beforeEach(() => {
  storeState.jobData.groupArray = [];
  clearActiveGroupIfMatches.mockClear();
  clearPendingJobGroupWrites.mockClear();
  replaceGroupArray.mockClear();
  releaseJobsAfterGroupRemoved.mockClear();
});

describe("recording that a delete has been applied", () => {
  it("records the delivery's position", async () => {
    const setPosition = vi.fn();

    await handleUserJobGroupDelete({
      docID: "group-1",
      docKey: "job_groups.group-1",
      position: 42,
      rs: { setPosition },
    });

    expect(setPosition).toHaveBeenCalledWith("job_groups.group-1", 42);
  });
});

// Removing the row is the least of it: the group's jobs have to be let go, the
// page has to stop showing a group that is gone, and a queued write for it must
// not be sent afterwards. A test that only watched the array would pass while a
// reader sat on a deleted group with its jobs still claimed by it.
describe("what a group delete does to the store", () => {
  const GROUP = { groupID: "group-1", groupName: "Capitals" };

  it("releases the group's jobs, closes it, and drops its queued write", async () => {
    storeState.jobData.groupArray = [GROUP, { groupID: "group-2" }];
    const removedRemotely = vi.fn();
    window.addEventListener("eip-group-deleted-remotely", removedRemotely);

    await handleUserJobGroupDelete({
      docID: "group-1",
      docKey: "job_groups.group-1",
      position: 8,
      rs: { setPosition: vi.fn() },
    });

    expect(releaseJobsAfterGroupRemoved).toHaveBeenCalledWith(GROUP);
    expect(clearActiveGroupIfMatches).toHaveBeenCalledWith("group-1");
    expect(clearPendingJobGroupWrites).toHaveBeenCalledWith("group-1");
    expect(replaceGroupArray).toHaveBeenCalledWith([{ groupID: "group-2" }]);
    expect(removedRemotely).toHaveBeenCalled();
    window.removeEventListener("eip-group-deleted-remotely", removedRemotely);
  });

  // The row can already be gone locally while jobs still carry its id, so the
  // release happens on the id rather than on a group object that is not there.
  it("releases jobs by id when the group row has already gone", async () => {
    await handleUserJobGroupDelete({
      docID: "group-gone",
      docKey: "job_groups.group-gone",
      position: 9,
      rs: { setPosition: vi.fn() },
    });

    expect(releaseJobsAfterGroupRemoved).toHaveBeenCalledWith({
      groupID: "group-gone",
    });
    expect(replaceGroupArray).not.toHaveBeenCalled();
  });
});
