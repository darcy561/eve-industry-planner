import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLockAcquireRelease } from "./useLockAcquireRelease.js";
import { DOCUMENT_LOCK_HELD_ACTIONS } from "./documentLockHeldReducer.js";
import { docLockScopeKey } from "../../Functions/DocumentLock/documentLockScope.js";

const acquireDocumentLock = vi.fn();
const releaseDocumentLock = vi.fn();

vi.mock("../../Functions/Endpoints/Private/documentLockClient.js", () => ({
  acquireDocumentLock: (...args) => acquireDocumentLock(...args),
  releaseDocumentLock: (...args) => releaseDocumentLock(...args),
}));

const mockLockScopes = {};

vi.mock("../../Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      documentLock: {
        scopes: mockLockScopes,
        actions: { pulseWaitlist: vi.fn() },
      },
    }),
  },
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
    for (const k of Object.keys(mockLockScopes)) delete mockLockScopes[k];
    acquireDocumentLock.mockResolvedValue(grantedResponse());
    releaseDocumentLock.mockResolvedValue(undefined);
  });

  it("edge-triggered self-heal calls acquire when scope becomes vacant-editable", async () => {
    const h = buildHarness();
    const { rerender, unmount } = renderHook(
      ({ lockHeld, readOnly }) =>
        useLockAcquireRelease({
          collection: "account_job_documents",
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

  it("mount acquire clears suppressVacancyAcquire from a prior voluntary leave", async () => {
    const h = buildHarness();
    mockLockScopes[docLockScopeKey("account_job_groups", "g1")] = {
      readOnly: false,
      lockHeld: false,
      suppressVacancyAcquire: true,
    };

    const { unmount } = renderHook(() =>
      useLockAcquireRelease({
        collection: "account_job_groups",
        docID: "g1",
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
        releaseOnUnmount: false,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(acquireDocumentLock).toHaveBeenCalledWith("account_job_groups", "g1");
    expect(h.patch).toHaveBeenCalledWith(
      expect.objectContaining({ suppressVacancyAcquire: false })
    );
    unmount();
  });

  it("does not self-heal acquire when suppressVacancyAcquire is set (voluntary leave)", async () => {
    const h = buildHarness();
    const key = docLockScopeKey("account_job_documents", "j1");
    mockLockScopes[key] = {
      readOnly: false,
      lockHeld: true,
      suppressVacancyAcquire: true,
    };

    const { rerender, unmount } = renderHook(
      ({ lockHeld, readOnly }) =>
        useLockAcquireRelease({
          collection: "account_job_documents",
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
      { initialProps: { lockHeld: true, readOnly: false } }
    );

    await act(async () => {
      await Promise.resolve();
    });
    const afterMount = acquireDocumentLock.mock.calls.length;

    await act(async () => {
      rerender({ lockHeld: false, readOnly: false });
      await Promise.resolve();
    });

    expect(acquireDocumentLock.mock.calls.length).toBe(afterMount);
    unmount();
  });

  it("marks scope bootstrapped after successful mount acquire", async () => {
    const h = buildHarness();
    const { unmount } = renderHook(() =>
      useLockAcquireRelease({
        collection: "account_job_documents",
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
      expect.objectContaining({
        lockHeld: true,
        lockScopeBootstrapped: true,
      })
    );
    unmount();
  });

  it("does not bootstrap header when mount acquire leaves scope vacant", async () => {
    acquireDocumentLock.mockResolvedValue({
      ok: true,
      status: 500,
      json: vi.fn().mockResolvedValue({}),
    });
    const h = buildHarness();
    const { unmount } = renderHook(() =>
      useLockAcquireRelease({
        collection: "account_job_documents",
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

    const bootstrappedCalls = h.patch.mock.calls.filter((args) =>
      args[0]?.lockScopeBootstrapped === true
    );
    expect(bootstrappedCalls).toHaveLength(0);
    unmount();
  });

  it("unmount release runs when store lockHeld is true but heldRef is false", async () => {
    const h = buildHarness();
    const { unmount } = renderHook(() =>
      useLockAcquireRelease({
        collection: "account_job_documents",
        docID: "j1",
        enabled: true,
        lockHeld: true,
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
    h.heldRef.current = false;
    mockLockScopes[docLockScopeKey("account_job_documents", "j1")] = {
      lockHeld: true,
      readOnly: false,
    };
    releaseDocumentLock.mockClear();

    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(releaseDocumentLock).toHaveBeenCalledWith(
      "account_job_documents",
      "j1"
    );
  });

  it("does not release on unmount when releaseOnUnmount is false", async () => {
    const h = buildHarness();
    h.heldRef.current = true;
    mockLockScopes[docLockScopeKey("account_job_documents", "j1")] = {
      lockHeld: true,
      readOnly: false,
    };

    const { unmount } = renderHook(() =>
      useLockAcquireRelease({
        collection: "account_job_documents",
        docID: "j1",
        enabled: true,
        lockHeld: true,
        readOnly: false,
        patch: h.patch,
        resetScope: h.resetScope,
        heldRef: h.heldRef,
        dispatchHeld: h.dispatchHeld,
        keyRef: h.keyRef,
        cancelReadOnlyGrace: h.cancelReadOnlyGrace,
        waitingInHandoffQueue: false,
        releaseOnUnmount: false,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    releaseDocumentLock.mockClear();
    h.resetScope.mockClear();

    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(releaseDocumentLock).not.toHaveBeenCalled();
    expect(h.resetScope).not.toHaveBeenCalled();
  });
});
