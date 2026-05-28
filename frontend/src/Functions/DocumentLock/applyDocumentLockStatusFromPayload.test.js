import { create } from "zustand";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import documentLockSlice from "../../Zustand/documentLockSlice.js";
import { docLockScopeKey } from "./documentLockScope.js";
import { LOCK_READONLY_GRACE_MS } from "./documentLockTimings.js";

const storeHolder = { current: null };

vi.mock("../../Zustand/usersStore.js", () => ({
  default: {
    getState: () => storeHolder.current.getState(),
    setState: (...args) => storeHolder.current.setState(...args),
    subscribe: (...args) => storeHolder.current.subscribe(...args),
  },
}));

import { applyDocumentLockStatusFromPayload } from "./applyDocumentLockStatusFromPayload.js";

describe("applyDocumentLockStatusFromPayload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storeHolder.current = create((set, get) => ({
      account: { sessionID: "session-self" },
      ...documentLockSlice(set, get),
    }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("sets lockHeld when this session is holder", () => {
    applyDocumentLockStatusFromPayload("user_job_documents", "j1", {
      held: true,
      holderSessionID: "session-self",
      expiresAtUnix: 100,
      ttlSeconds: 60,
      viewerCount: 2,
      extendCount: 1,
      waitlistLen: 0,
    });
    const k = docLockScopeKey("user_job_documents", "j1");
    const scope = storeHolder.current.getState().documentLock.scopes[k];
    expect(scope.lockHeld).toBe(true);
    expect(scope.readOnly).toBe(false);
    expect(scope.viewerCount).toBe(2);
    expect(scope.extendSegmentCount).toBe(1);
    expect(scope.waitlistLen).toBe(0);
    expect(scope.lockExpiresAtUnix).toBe(100);
    expect(scope.lockTtlSeconds).toBe(60);
  });

  it("sets readOnly when another session holds", () => {
    applyDocumentLockStatusFromPayload("user_job_documents", "j1", {
      held: true,
      holderSessionID: "other-session",
    });
    const k = docLockScopeKey("user_job_documents", "j1");
    const scope = storeHolder.current.getState().documentLock.scopes[k];
    expect(scope.readOnly).toBe(true);
    expect(scope.lockHeld).toBe(false);
  });

  it("preserves readOnly and clears it after grace when lock drops", () => {
    const { patchDocumentLockForScope } =
      storeHolder.current.getState().documentLock.actions;
    patchDocumentLockForScope("user_job_documents", "j1", { readOnly: true });
    applyDocumentLockStatusFromPayload("user_job_documents", "j1", { held: false });
    const k = docLockScopeKey("user_job_documents", "j1");
    let scope = storeHolder.current.getState().documentLock.scopes[k];
    expect(scope.readOnly).toBe(true);
    expect(scope.lockHeld).toBe(false);
    vi.advanceTimersByTime(LOCK_READONLY_GRACE_MS);
    scope = storeHolder.current.getState().documentLock.scopes[k];
    expect(scope.readOnly).toBe(false);
  });

  it("returns early for falsy docID", () => {
    applyDocumentLockStatusFromPayload("user_job_documents", "", { held: false });
    expect(storeHolder.current.getState().documentLock.scopes).toEqual({});
  });
});
