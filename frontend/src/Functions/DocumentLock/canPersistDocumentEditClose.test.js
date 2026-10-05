import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import documentLockSlice from "../../Zustand/documentLockSlice.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "./documentLockCollections.js";

const storeHolder = { current: null };

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeHolder.current.getState()));
});

import {
  canPersistJobClose,
  canPersistGroupClose,
  canEditActiveJob,
  canEditActiveGroup,
} from "./canPersistDocumentEditClose.js";

describe("canPersistDocumentEditClose", () => {
  beforeEach(() => {
    storeHolder.current = create((set, get) => ({
      account: { sessionID: "sess-a", isLoggedIn: true },
      ...documentLockSlice(set, get),
    }));
  });

  it("canPersistJobClose requires job holder and not read-only", () => {
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOBS_COLLECTION,
        "j1",
        { lockHeld: true, readOnly: false },
      );
    expect(canPersistJobClose("j1")).toBe(true);

    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOBS_COLLECTION,
        "j1",
        { lockHeld: false, readOnly: true },
      );
    expect(canPersistJobClose("j1")).toBe(false);
  });

  it("canPersistJobClose needs the job's own lock and not the group's", () => {
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOBS_COLLECTION,
        "j1",
        { lockHeld: true, readOnly: false },
      );
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOB_GROUPS_COLLECTION,
        "g1",
        { lockHeld: false, readOnly: true },
      );
    expect(canPersistJobClose("j1")).toBe(true);
  });

  it("canPersistGroupClose matches holder and not read-only", () => {
    storeHolder.current
      .getState()
      .documentLock.actions.patchDocumentLockForScope(
        USER_JOB_GROUPS_COLLECTION,
        "g1",
        { lockHeld: true, readOnly: false },
      );
    expect(canPersistGroupClose("g1")).toBe(true);
  });

  describe("canEditActiveJob / canEditActiveGroup (aligned UI gates)", () => {
    it("allows logged-out local edits without a lease", () => {
      storeHolder.current.setState({ account: { isLoggedIn: false } });
      expect(canEditActiveJob("j1")).toBe(true);
      expect(canEditActiveJob(null)).toBe(false);
      expect(canEditActiveGroup("g1")).toBe(true);
      expect(canEditActiveGroup(null)).toBe(false);
    });

    it("matches canPersist*Close when logged in", () => {
      storeHolder.current
        .getState()
        .documentLock.actions.patchDocumentLockForScope(
          USER_JOBS_COLLECTION,
          "j1",
          { lockHeld: false, readOnly: false },
        );
      storeHolder.current
        .getState()
        .documentLock.actions.patchDocumentLockForScope(
          USER_JOB_GROUPS_COLLECTION,
          "g1",
          { lockHeld: false, readOnly: false },
        );
      expect(canEditActiveJob("j1")).toBe(false);
      expect(canEditActiveGroup("g1")).toBe(false);
      expect(canEditActiveJob("j1")).toBe(canPersistJobClose("j1"));
      expect(canEditActiveGroup("g1")).toBe(canPersistGroupClose("g1"));

      storeHolder.current
        .getState()
        .documentLock.actions.patchDocumentLockForScope(
          USER_JOBS_COLLECTION,
          "j1",
          { lockHeld: true, readOnly: false },
        );
      storeHolder.current
        .getState()
        .documentLock.actions.patchDocumentLockForScope(
          USER_JOB_GROUPS_COLLECTION,
          "g1",
          { lockHeld: true, readOnly: false },
        );
      expect(canEditActiveJob("j1")).toBe(true);
      expect(canEditActiveGroup("g1")).toBe(true);
      expect(canEditActiveJob("j1")).toBe(canPersistJobClose("j1"));
      expect(canEditActiveGroup("g1")).toBe(canPersistGroupClose("g1"));
    });

    it("blocks logged-in viewers (read-only) the same way for job and group", () => {
      storeHolder.current
        .getState()
        .documentLock.actions.patchDocumentLockForScope(
          USER_JOBS_COLLECTION,
          "j1",
          { lockHeld: false, readOnly: true },
        );
      storeHolder.current
        .getState()
        .documentLock.actions.patchDocumentLockForScope(
          USER_JOB_GROUPS_COLLECTION,
          "g1",
          { lockHeld: false, readOnly: true },
        );
      expect(canEditActiveJob("j1")).toBe(false);
      expect(canEditActiveGroup("g1")).toBe(false);
    });
  });
});
