import { create } from "zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";
import documentLockSlice from "../../Zustand/documentLockSlice.js";
import { docLockScopeKey } from "./documentLockScope.js";
import {
  endReadOnlyGraceIfApplicable,
  shouldEndReadOnlyGrace,
} from "./readOnlyGrace.js";

const storeHolder = { current: null };

vi.mock("../../Zustand/usersStore.js", () => ({
  default: {
    getState: () => storeHolder.current.getState(),
    setState: (...args) => storeHolder.current.setState(...args),
    subscribe: (...args) => storeHolder.current.subscribe(...args),
  },
}));

describe("shouldEndReadOnlyGrace", () => {
  it("is true only for read-only, not held, no expiry", () => {
    expect(shouldEndReadOnlyGrace(null)).toBe(false);
    expect(
      shouldEndReadOnlyGrace({
        readOnly: true,
        lockHeld: false,
        lockExpiresAtUnix: null,
      })
    ).toBe(true);
    expect(
      shouldEndReadOnlyGrace({
        readOnly: true,
        lockHeld: true,
        lockExpiresAtUnix: null,
      })
    ).toBe(false);
    expect(
      shouldEndReadOnlyGrace({
        readOnly: false,
        lockHeld: false,
        lockExpiresAtUnix: null,
      })
    ).toBe(false);
    expect(
      shouldEndReadOnlyGrace({
        readOnly: true,
        lockHeld: false,
        lockExpiresAtUnix: 123,
      })
    ).toBe(false);
  });
});

describe("endReadOnlyGraceIfApplicable", () => {
  beforeEach(() => {
    storeHolder.current = create((set, get) => ({
      account: { sessionID: "me" },
      ...documentLockSlice(set, get),
    }));
  });

  it("patches readOnly false when predicate matches", () => {
    const { patchDocumentLockForScope } =
      storeHolder.current.getState().documentLock.actions;
    patchDocumentLockForScope("user_job_documents", "j1", {
      readOnly: true,
      lockHeld: false,
      lockExpiresAtUnix: null,
    });
    expect(endReadOnlyGraceIfApplicable("user_job_documents", "j1")).toBe(true);
    const k = docLockScopeKey("user_job_documents", "j1");
    expect(storeHolder.current.getState().documentLock.scopes[k].readOnly).toBe(
      false
    );
  });

  it("returns false for empty collection or docID", () => {
    expect(endReadOnlyGraceIfApplicable("", "j1")).toBe(false);
    expect(endReadOnlyGraceIfApplicable("user_job_documents", "")).toBe(false);
  });

  it("returns false when grace predicate no longer applies", () => {
    const { patchDocumentLockForScope } =
      storeHolder.current.getState().documentLock.actions;
    patchDocumentLockForScope("user_job_documents", "j1", {
      readOnly: false,
      lockHeld: false,
      lockExpiresAtUnix: null,
    });
    expect(endReadOnlyGraceIfApplicable("user_job_documents", "j1")).toBe(false);
  });

  it("returns false when scope still looks like someone holds the lease", () => {
    const { patchDocumentLockForScope } =
      storeHolder.current.getState().documentLock.actions;
    patchDocumentLockForScope("user_job_documents", "j1", {
      readOnly: true,
      lockHeld: false,
      lockExpiresAtUnix: 9_999_999_999,
    });
    expect(endReadOnlyGraceIfApplicable("user_job_documents", "j1")).toBe(false);
  });
});
