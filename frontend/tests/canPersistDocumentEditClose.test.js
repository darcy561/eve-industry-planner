import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import documentLockSlice from "../src/Zustand/documentLockSlice.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../src/Functions/DocumentLock/documentLockCollections.js";

const storeHolder = { current: null };

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => storeHolder.current.getState(),
  },
}));

import {
  canPersistJobClose,
  canPersistGroupClose,
} from "../src/Functions/DocumentLock/canPersistDocumentEditClose.js";

describe("canPersistDocumentEditClose", () => {
  beforeEach(() => {
    storeHolder.current = create((set, get) => ({
      account: { sessionID: "sess-a" },
      ...documentLockSlice(set, get),
    }));
  });

  it("canPersistJobClose requires job holder and not read-only", () => {
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      "j1",
      { lockHeld: true, readOnly: false }
    );
    expect(canPersistJobClose("j1", null)).toBe(true);

    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      "j1",
      { lockHeld: false, readOnly: true }
    );
    expect(canPersistJobClose("j1", null)).toBe(false);
  });

  it("canPersistJobClose requires group lock when grouped", () => {
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      "j1",
      { lockHeld: true, readOnly: false }
    );
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOB_GROUPS_COLLECTION,
      "g1",
      { lockHeld: true, readOnly: false }
    );
    storeHolder.current.setState((prev) => ({
      jobData: {
        actions: {
          getGroupObject: (id) => (id === "g1" ? { groupID: "g1" } : null),
        },
      },
    }));
    expect(canPersistJobClose("j1", "g1")).toBe(true);

    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOB_GROUPS_COLLECTION,
      "g1",
      { lockHeld: false, readOnly: true }
    );
    expect(canPersistJobClose("j1", "g1")).toBe(false);
  });

  it("canPersistJobClose ignores stale groupID when the group is gone", () => {
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      "j1",
      { lockHeld: true, readOnly: false }
    );
    storeHolder.current.setState({
      jobData: {
        actions: {
          getGroupObject: () => null,
        },
      },
    });
    expect(canPersistJobClose("j1", "g-deleted")).toBe(true);
  });

  it("canPersistGroupClose matches holder and not read-only", () => {
    storeHolder.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOB_GROUPS_COLLECTION,
      "g1",
      { lockHeld: true, readOnly: false }
    );
    expect(canPersistGroupClose("g1")).toBe(true);
  });
});
