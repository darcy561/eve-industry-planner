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
  it("yields solo job lock when no groupID", async () => {
    await yieldEditJobDocumentLocksOnLeave({ jobID: "job-1", groupID: null });
    expect(yieldDocumentLockOnLeave).toHaveBeenCalledWith(
      "job_documents",
      "job-1",
    );
  });

  it("no-ops in group context", async () => {
    await yieldEditJobDocumentLocksOnLeave({
      jobID: "job-1",
      groupID: "group-1",
    });
    expect(yieldDocumentLockOnLeave).not.toHaveBeenCalled();
  });
});
