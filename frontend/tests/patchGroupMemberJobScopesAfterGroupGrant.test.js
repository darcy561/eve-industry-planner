import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { USER_JOBS_COLLECTION } from "../src/Functions/DocumentLock/documentLockCollections.js";
import { patchGroupMemberJobScopesAfterGroupGrant } from "../src/Functions/DocumentLock/patchGroupMemberJobScopesAfterGroupGrant.js";

const patchManyDocumentLockScopes = vi.fn();

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => useTestStore.getState(),
  },
}));

const useTestStore = create(() => ({
  jobData: {
    actions: {
      getGroupObject: (groupID) =>
        groupID === "g1"
          ? { groupID: "g1", includedJobIDs: new Set(["j1", "j2"]) }
          : null,
    },
  },
  documentLock: {
    actions: { patchManyDocumentLockScopes },
  },
}));

describe("patchGroupMemberJobScopesAfterGroupGrant", () => {
  it("patches every included job to editable-under-group shape", () => {
    patchGroupMemberJobScopesAfterGroupGrant("g1");

    expect(patchManyDocumentLockScopes).toHaveBeenCalledOnce();
    const updates = patchManyDocumentLockScopes.mock.calls[0][0];
    expect(updates).toHaveLength(2);
    expect(updates).toEqual(
      expect.arrayContaining([
        {
          collection: USER_JOBS_COLLECTION,
          docID: "j1",
          partial: {
            lockHeld: false,
            readOnly: false,
            pendingAccessRequest: false,
            lockExpiresAtUnix: null,
            lockTtlSeconds: null,
          },
        },
        {
          collection: USER_JOBS_COLLECTION,
          docID: "j2",
          partial: expect.objectContaining({ readOnly: false, lockHeld: false }),
        },
      ])
    );
  });

  it("no-ops when group is unknown", () => {
    patchGroupMemberJobScopesAfterGroupGrant("missing");
    expect(patchManyDocumentLockScopes).not.toHaveBeenCalled();
  });
});
