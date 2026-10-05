import { describe, expect, it, vi } from "vitest";

const yieldDocumentLockOnLeave = vi.fn();

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      documentLock: {
        actions: { yieldDocumentLockOnLeave },
      },
    }),
  );
});

import { yieldEditJobDocumentLocksOnLeave } from "./yieldEditJobDocumentLocksOnLeave.js";

describe("yieldEditJobDocumentLocksOnLeave", () => {
  it("yields the job's own lock", async () => {
    yieldDocumentLockOnLeave.mockClear();
    await yieldEditJobDocumentLocksOnLeave({ jobID: "job-1" });
    expect(yieldDocumentLockOnLeave).toHaveBeenCalledWith(
      "job_documents",
      "job-1",
    );
  });

  it("yields nothing when no job is open", async () => {
    yieldDocumentLockOnLeave.mockClear();
    await yieldEditJobDocumentLocksOnLeave({ jobID: null });
    expect(yieldDocumentLockOnLeave).not.toHaveBeenCalled();
  });
});
