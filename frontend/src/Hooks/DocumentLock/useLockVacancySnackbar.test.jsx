import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { docLockScopeKey } from "../../Functions/DocumentLock/documentLockScope.js";
import {
  showSnackbarSuccess,
  showSnackbarWarning,
} from "../../Events/snackbarEvents.js";
import { shouldSuppressDocumentLockVacancyNotice } from "../../Functions/DocumentLock/documentLockAcquireFeedback.js";
import { useLockVacancySnackbar } from "./useLockVacancySnackbar.js";

vi.mock("../../Events/snackbarEvents.js", () => ({
  showSnackbarSuccess: vi.fn(),
  showSnackbarWarning: vi.fn(),
}));

vi.mock("../../Functions/DocumentLock/documentLockAcquireFeedback.js", () => ({
  shouldSuppressDocumentLockVacancyNotice: vi.fn(() => false),
}));

describe("useLockVacancySnackbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldSuppressDocumentLockVacancyNotice.mockReturnValue(false);
  });

  it("shows lost-owner warning when holder becomes read-only viewer", () => {
    const sk = docLockScopeKey("col", "doc1");
    const prevHolderUiRef = {
      current: {
        scopeKey: sk,
        readOnly: false,
        lockHeld: true,
        waitingInHandoffQueue: false,
      },
    };

    const stable = {
      enabled: true,
      collection: "col",
      docID: "doc1",
      waitingInHandoffQueue: false,
      prevHolderUiRef,
      lostOwnerMessage: "lost copy",
      becameOwnerVacantMessage: "vacant copy",
    };

    const { rerender } = renderHook((p) => useLockVacancySnackbar(p), {
      initialProps: { ...stable, lockHeld: true, readOnly: false },
    });

    rerender({ ...stable, lockHeld: false, readOnly: true });

    expect(showSnackbarWarning).toHaveBeenCalledWith("lost copy", 6);
    expect(showSnackbarSuccess).not.toHaveBeenCalled();
  });

  it("does not show became-owner-from-vacant when uncontested (solo open)", () => {
    const sk = docLockScopeKey("col", "doc2");
    const prevHolderUiRef = {
      current: {
        scopeKey: sk,
        readOnly: false,
        lockHeld: false,
        waitingInHandoffQueue: false,
      },
    };

    const stable = {
      enabled: true,
      collection: "col",
      docID: "doc2",
      waitingInHandoffQueue: false,
      viewerCount: 0,
      waitlistLen: 0,
      pendingAccessRequest: false,
      handoffPendingHolder: false,
      handoffOfferForMe: false,
      prevHolderUiRef,
      lostOwnerMessage: "lost",
      becameOwnerVacantMessage: "you edit now",
    };

    const { rerender } = renderHook((p) => useLockVacancySnackbar(p), {
      initialProps: { ...stable, lockHeld: false, readOnly: false },
    });

    rerender({ ...stable, lockHeld: true, readOnly: false });

    expect(showSnackbarSuccess).not.toHaveBeenCalled();
  });

  it("shows became-owner-from-vacant when another session is present", () => {
    const sk = docLockScopeKey("col", "doc2b");
    const prevHolderUiRef = {
      current: {
        scopeKey: sk,
        readOnly: false,
        lockHeld: false,
        waitingInHandoffQueue: false,
      },
    };

    const stable = {
      enabled: true,
      collection: "col",
      docID: "doc2b",
      waitingInHandoffQueue: false,
      viewerCount: 1,
      waitlistLen: 0,
      pendingAccessRequest: false,
      handoffPendingHolder: false,
      handoffOfferForMe: false,
      prevHolderUiRef,
      lostOwnerMessage: "lost",
      becameOwnerVacantMessage: "you edit now",
    };

    const { rerender } = renderHook((p) => useLockVacancySnackbar(p), {
      initialProps: { ...stable, lockHeld: false, readOnly: false },
    });

    rerender({ ...stable, lockHeld: true, readOnly: false });

    expect(showSnackbarSuccess).toHaveBeenCalledWith("you edit now", 4);
  });

  it("does not show became-vacant when suppress is active", () => {
    shouldSuppressDocumentLockVacancyNotice.mockReturnValue(true);
    const sk = docLockScopeKey("col", "doc3");
    const prevHolderUiRef = {
      current: {
        scopeKey: sk,
        readOnly: false,
        lockHeld: false,
        waitingInHandoffQueue: false,
      },
    };

    const stable = {
      enabled: true,
      collection: "col",
      docID: "doc3",
      waitingInHandoffQueue: false,
      prevHolderUiRef,
      lostOwnerMessage: "lost",
      becameOwnerVacantMessage: "vacant",
    };

    const { rerender } = renderHook((p) => useLockVacancySnackbar(p), {
      initialProps: { ...stable, lockHeld: false, readOnly: false },
    });

    rerender({ ...stable, lockHeld: true, readOnly: false });

    expect(showSnackbarSuccess).not.toHaveBeenCalled();
  });
});
