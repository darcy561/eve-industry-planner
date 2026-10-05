import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../Functions/Endpoints/Private/documentLockClient.js", () => ({
  getDocumentLockState: vi.fn(),
}));

vi.mock("../../Functions/DocumentLock/lockParticipant.js", () => ({
  myLockParticipantID: () => "me",
}));

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock({ account: { sessionID: "s" } });
});

import { getDocumentLockState } from "../../Functions/Endpoints/Private/documentLockClient.js";
import { useLockSyncFromServer } from "./useLockSyncFromServer.js";

function syncWith(data) {
  getDocumentLockState.mockResolvedValue({
    ok: true,
    json: async () => data,
  });
  const patch = vi.fn();
  const { result } = renderHook(() =>
    useLockSyncFromServer({
      collection: "job_documents",
      docID: "j1",
      enabled: true,
      patch,
      dispatchHeld: vi.fn(),
      tryAcquire: vi.fn(),
      startReadOnlyGrace: vi.fn(),
    }),
  );
  return { patch, sync: result.current.syncLockFromServer };
}

describe("useLockSyncFromServer", () => {
  beforeEach(() => {
    getDocumentLockState.mockReset();
  });

  it("marks a lock held by another session of this account so it can be cleared", async () => {
    const { patch, sync } = syncWith({
      held: true,
      holderParticipantID: "other-tab",
      heldByThisAccount: true,
    });
    await sync();
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({ readOnly: true, heldByThisAccount: true }),
    );
  });

  it("does not offer clearing a lock another member holds", async () => {
    const { patch, sync } = syncWith({
      held: true,
      holderParticipantID: "member",
      heldByThisAccount: false,
    });
    await sync();
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({ readOnly: true, heldByThisAccount: false }),
    );
  });

  it("clears the account flag once the lock is gone", async () => {
    const { patch, sync } = syncWith({ held: false });
    await sync();
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({ lockHeld: false, heldByThisAccount: false }),
    );
  });
});
