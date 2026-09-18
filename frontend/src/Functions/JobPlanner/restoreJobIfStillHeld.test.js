import { beforeEach, describe, expect, it, vi } from "vitest";
import { activePlannerStoreState } from "../../tests/utils.js";

const storeState = activePlannerStoreState();
const updateOrAddJobsToJobArray = vi.fn();

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});

const { restoreJobIfStillHeld } = await import("./restoreJobIfStillHeld.js");

const HELD = { jobID: "job-held" };

beforeEach(() => {
  updateOrAddJobsToJobArray.mockClear();
  storeState.jobData.actions = {
    ...storeState.jobData.actions,
    updateOrAddJobsToJobArray,
    findJobInJobArray: (jobID) => (jobID === HELD.jobID ? HELD : null),
  };
});

describe("restoring the copy taken when editing began", () => {
  it("puts back a job the store still holds", () => {
    expect(restoreJobIfStillHeld(HELD)).toBe(true);
    expect(updateOrAddJobsToJobArray).toHaveBeenCalledWith(HELD);
  });

  // The case every discard path shares: the job went while the reader had it
  // open, and putting the backup back would show them what they were just told
  // is gone.
  it("leaves a job the store no longer holds alone", () => {
    expect(restoreJobIfStillHeld({ jobID: "job-deleted" })).toBe(false);
    expect(updateOrAddJobsToJobArray).not.toHaveBeenCalled();
  });

  it("does nothing without a job to restore", () => {
    expect(restoreJobIfStillHeld(null)).toBe(false);
    expect(restoreJobIfStillHeld({})).toBe(false);
    expect(updateOrAddJobsToJobArray).not.toHaveBeenCalled();
  });
});
