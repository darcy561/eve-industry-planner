import { beforeEach, describe, expect, it, vi } from "vitest";

const yieldDocumentLockOnLeave = vi.fn();

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      documentLock: {
        actions: { yieldDocumentLockOnLeave },
      },
    }),
  },
}));

import { yieldEditJobDocumentLocksOnLeave } from "../src/Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";

describe("yieldEditJobDocumentLocksOnLeave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields solo job lock when no groupID", async () => {
    await yieldEditJobDocumentLocksOnLeave({ jobID: "job-1", groupID: null });
    expect(yieldDocumentLockOnLeave).toHaveBeenCalledWith(
      "account_job_documents",
      "job-1"
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
