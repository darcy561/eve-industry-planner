import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { docLockScopeKey } from "../../Functions/DocumentLock/documentLockScope.js";
import { showSnackbarInfo } from "../../Events/snackbarEvents.js";
import { useLockPassiveViewerSnackbar } from "./useLockPassiveViewerSnackbar.js";

vi.mock("../../Events/snackbarEvents.js", () => ({
  showSnackbarInfo: vi.fn(),
}));

describe("useLockPassiveViewerSnackbar", () => {

  function prevRef(sk, viewerCount = 0, lockHeld = true, readOnly = false) {
    return {
      current: {
        scopeKey: sk,
        viewerCount,
        lockHeld,
        readOnly,
      },
    };
  }

  const stable = {
    enabled: true,
    collection: "col",
    docID: "doc1",
    lockScopeBootstrapped: true,
    passiveViewerMessage: undefined,
  };

  it("shows once when viewer count goes 0 → 1 while holder", () => {
    const sk = docLockScopeKey("col", "doc1");
    const prevPassiveViewerRef = prevRef(sk, 0);

    const { rerender } = renderHook((p) => useLockPassiveViewerSnackbar(p), {
      initialProps: {
        ...stable,
        prevPassiveViewerRef,
        lockHeld: true,
        readOnly: false,
        viewerCount: 0,
      },
    });

    rerender({
      ...stable,
      prevPassiveViewerRef,
      lockHeld: true,
      readOnly: false,
      viewerCount: 1,
    });

    expect(showSnackbarInfo).toHaveBeenCalledTimes(1);
    expect(showSnackbarInfo).toHaveBeenCalledWith(
      "Another session is viewing this document — you still hold the edit lock.",
      5
    );

    rerender({
      ...stable,
      prevPassiveViewerRef,
      lockHeld: true,
      readOnly: false,
      viewerCount: 2,
    });

    expect(showSnackbarInfo).toHaveBeenCalledTimes(1);
  });

  it("does not show when opening scope already has viewers", () => {
    const sk = docLockScopeKey("col", "doc2");
    const prevPassiveViewerRef = {
      current: { scopeKey: "", viewerCount: 0, lockHeld: false, readOnly: true },
    };

    const { rerender } = renderHook((p) => useLockPassiveViewerSnackbar(p), {
      initialProps: {
        ...stable,
        docID: "doc2",
        prevPassiveViewerRef,
        lockHeld: true,
        readOnly: false,
        viewerCount: 2,
      },
    });

    rerender({
      ...stable,
      docID: "doc2",
      prevPassiveViewerRef,
      lockHeld: true,
      readOnly: false,
      viewerCount: 3,
    });

    expect(showSnackbarInfo).not.toHaveBeenCalled();
  });

  it("does not show before scope is bootstrapped", () => {
    const sk = docLockScopeKey("col", "doc3");
    const prevPassiveViewerRef = prevRef(sk, 0);

    const { rerender } = renderHook((p) => useLockPassiveViewerSnackbar(p), {
      initialProps: {
        ...stable,
        docID: "doc3",
        prevPassiveViewerRef,
        lockScopeBootstrapped: false,
        lockHeld: true,
        readOnly: false,
        viewerCount: 0,
      },
    });

    rerender({
      ...stable,
      docID: "doc3",
      prevPassiveViewerRef,
      lockScopeBootstrapped: false,
      lockHeld: true,
      readOnly: false,
      viewerCount: 1,
    });

    expect(showSnackbarInfo).not.toHaveBeenCalled();
  });
});
