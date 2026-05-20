import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLockAcquireRelease } from "./useLockAcquireRelease.js";
import { DOCUMENT_LOCK_HELD_ACTIONS } from "./documentLockHeldReducer.js";

const acquireDocumentLock = vi.fn();
const releaseDocumentLock = vi.fn();

vi.mock("../../Functions/Endpoints/Pirivate/documentLockClient.js", () => ({
  acquireDocumentLock: (...args) => acquireDocumentLock(...args),
  releaseDocumentLock: (...args) => releaseDocumentLock(...args),
}));

vi.mock("../../Zustand/usersStore.js", () => ({
  default: { getState: () => ({ documentLock: { actions: { pulseWaitlist: vi.fn() } } }) },
}));

function grantedResponse() {
  return {
    ok: true,
    status: 201,
    json: vi.fn().mockResolvedValue({
      expiresAtUnix: 9999999999,
      ttlSeconds: 300,
    }),
  };
}

function buildHarness() {
  const heldRef = { current: false };
  const keyRef = { current: { collection: "", docID: "" } };
  const patch = vi.fn();
  const resetScope = vi.fn();
  const dispatchHeld = vi.fn((a) => {
    if (a?.type === DOCUMENT_LOCK_HELD_ACTIONS.SET) heldRef.current = a.held;
  });
  const cancelReadOnlyGrace = vi.fn();
  return { heldRef, keyRef, patch, resetScope, dispatchHeld, cancelReadOnlyGrace };
}

describe("useLockAcquireRelease (#21 vacancy self-heal)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acquireDocumentLock.mockResolvedValue(grantedResponse());
    releaseDocumentLock.mockResolvedValue(undefined);
  });

  it("edge-triggered self-heal calls acquire when scope becomes vacant-editable", async () => {
    const h = buildHarness();
    const { rerender, unmount } = renderHook(
      ({ lockHeld, readOnly }) =>
        useLockAcquireRelease({
          collection: "user_job_documents",
          docID: "j1",
          enabled: true,
          lockHeld,
          readOnly,
          patch: h.patch,
          resetScope: h.resetScope,
          heldRef: h.heldRef,
          dispatchHeld: h.dispatchHeld,
          keyRef: h.keyRef,
          cancelReadOnlyGrace: h.cancelReadOnlyGrace,
          waitingInHandoffQueue: false,
        }),
      { initialProps: { lockHeld: false, readOnly: true } }
    );

    await act(async () => {
      await Promise.resolve();
    });
    const afterViewer = acquireDocumentLock.mock.calls.length;

    await act(async () => {
      rerender({ lockHeld: false, readOnly: false });
      await Promise.resolve();
    });

    expect(acquireDocumentLock.mock.calls.length).toBeGreaterThan(afterViewer);
    unmount();
  });

  it("marks scope bootstrapped after first mount acquire attempt", async () => {
    const h = buildHarness();
    const { unmount } = renderHook(() =>
      useLockAcquireRelease({
        collection: "user_job_documents",
        docID: "j1",
        enabled: true,
        lockHeld: false,
        readOnly: false,
        patch: h.patch,
        resetScope: h.resetScope,
        heldRef: h.heldRef,
        dispatchHeld: h.dispatchHeld,
        keyRef: h.keyRef,
        cancelReadOnlyGrace: h.cancelReadOnlyGrace,
        waitingInHandoffQueue: false,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(h.patch).toHaveBeenCalledWith(
      expect.objectContaining({ lockScopeBootstrapped: true })
    );
    unmount();
  });
});
