import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLockWsListener } from "./useLockWsListener.js";
import {
  DOCUMENT_LOCK_CUSTOM_EVENT,
  DOCUMENT_LOCK_DOMAIN_EVENTS,
} from "../../Functions/DocumentLock/documentLockEvents.js";
import { USER_JOBS_COLLECTION } from "../../Functions/DocumentLock/documentLockCollections.js";
import { docLockScopeKey } from "../../Functions/DocumentLock/documentLockScope.js";
import { DOCUMENT_LOCK_HELD_ACTIONS } from "./documentLockHeldReducer.js";

const showDocumentLockAccessRequestSnackbar = vi.fn();

const claimHandoffProbe = vi.fn();

vi.mock("../../Events/snackbarEvents.js", () => ({
  showDocumentLockAccessRequestSnackbar: (...args) =>
    showDocumentLockAccessRequestSnackbar(...args),
}));

/** Mutable snapshot returned by `useUsersStore.getState()` */
const storeSnapshot = {
  account: { sessionID: "jwt-session-shared" },
  documentLock: {
    scopes: {},
    actions: { claimHandoffProbe },
  },
};

vi.mock("../../Zustand/usersStore.js", () => ({
  default: {
    getState: () => storeSnapshot,
  },
}));

function dispatchLockEvent(detail) {
  window.dispatchEvent(
    new CustomEvent(DOCUMENT_LOCK_CUSTOM_EVENT, { detail })
  );
}

describe("useLockWsListener — document_lock_requested (regression)", () => {
  const collection = "job_documents";
  const docID = "job-ws-1";
  const scopeKey = docLockScopeKey(collection, docID);

  beforeEach(() => {
    storeSnapshot.documentLock.scopes = {};
    storeSnapshot.account.sessionID = "jwt-session-shared";
  });

  function mountListener(heldRefValue) {
    const heldRef = { current: heldRefValue };
    const patch = vi.fn();
    const syncLockFromServer = vi.fn();
    const cancelReadOnlyGrace = vi.fn();
    const dispatchHeld = vi.fn();

    const view = renderHook(() =>
      useLockWsListener({
        collection,
        docID,
        sessionID: "jwt-session-shared",
        pendingAccessRequestMessage: "Another tab wants access.",
        patch,
        syncLockFromServer,
        cancelReadOnlyGrace,
        heldRef,
        dispatchHeld,
      })
    );
    return {
      ...view,
      heldRef,
      patch,
      syncLockFromServer,
      cancelReadOnlyGrace,
      dispatchHeld,
    };
  }

  it("fires snackbar when Zustand lockHeld is true even if heldRef is still false (WS before held ref sync)", async () => {
    storeSnapshot.documentLock.scopes[scopeKey] = {
      lockHeld: true,
      readOnly: false,
      pendingAccessRequest: false,
    };
    const { heldRef, patch, unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        collection,
        docID,
        requesterSessionID: "jwt-session-shared",
      });
    });

    expect(showDocumentLockAccessRequestSnackbar).toHaveBeenCalledTimes(1);
    expect(showDocumentLockAccessRequestSnackbar).toHaveBeenCalledWith(
      "Another tab wants access.",
      { collection, docID }
    );
    expect(patch).toHaveBeenCalledWith({ pendingAccessRequest: true });
    expect(heldRef.current).toBe(false);
    unmount();
  });

  it("fires snackbar when heldRef is true even if store lockHeld is false (edge mirror)", async () => {
    storeSnapshot.documentLock.scopes[scopeKey] = {
      lockHeld: false,
      readOnly: false,
      pendingAccessRequest: false,
    };
    const { unmount } = mountListener(true);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        collection,
        docID,
        requesterSessionID: "other-session",
      });
    });

    expect(showDocumentLockAccessRequestSnackbar).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not snackbar when neither store lockHeld nor heldRef indicate holder", async () => {
    storeSnapshot.documentLock.scopes[scopeKey] = {
      lockHeld: false,
      readOnly: true,
      pendingAccessRequest: false,
    };
    const { patch, unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        collection,
        docID,
        requesterSessionID: "other-session",
      });
    });

    expect(showDocumentLockAccessRequestSnackbar).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    unmount();
  });

  it("ignores REQUESTED without requesterSessionID", async () => {
    storeSnapshot.documentLock.scopes[scopeKey] = { lockHeld: true, readOnly: false };
    const { patch, unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        collection,
        docID,
      });
    });

    expect(showDocumentLockAccessRequestSnackbar).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    unmount();
  });

  it("ignores REQUESTED for a different docID", async () => {
    storeSnapshot.documentLock.scopes[scopeKey] = { lockHeld: true, readOnly: false };
    const { patch, unmount } = mountListener(true);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        collection,
        docID: "other-job",
        requesterSessionID: "x",
      });
    });

    expect(showDocumentLockAccessRequestSnackbar).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    unmount();
  });

  it("EXPIRED triggers syncLockFromServer", async () => {
    const { syncLockFromServer, unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.EXPIRED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.EXPIRED,
        collection,
        docID,
      });
    });

    expect(syncLockFromServer).toHaveBeenCalled();
    unmount();
  });

  it("ACQUIRED triggers cancelReadOnlyGrace and syncLockFromServer", async () => {
    const { syncLockFromServer, cancelReadOnlyGrace, unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.ACQUIRED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.ACQUIRED,
        collection,
        docID,
      });
    });

    expect(cancelReadOnlyGrace).toHaveBeenCalled();
    expect(syncLockFromServer).toHaveBeenCalled();
    unmount();
  });

  it("HANDOFF_COMPLETED triggers cancelReadOnlyGrace and syncLockFromServer", async () => {
    const { syncLockFromServer, cancelReadOnlyGrace, unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.HANDOFF_COMPLETED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.HANDOFF_COMPLETED,
        collection,
        docID,
      });
    });

    expect(cancelReadOnlyGrace).toHaveBeenCalled();
    expect(syncLockFromServer).toHaveBeenCalled();
    unmount();
  });

  it("RELEASED clears lock and dispatchHeld false", async () => {
    const { patch, dispatchHeld, cancelReadOnlyGrace, unmount } = mountListener(true);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.RELEASED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.RELEASED,
        collection,
        docID,
        reason: "holder_release",
      });
    });

    expect(cancelReadOnlyGrace).toHaveBeenCalled();
    expect(dispatchHeld).toHaveBeenCalledWith({
      type: DOCUMENT_LOCK_HELD_ACTIONS.SET,
      held: false,
    });
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({
        lockHeld: false,
        readOnly: false,
        pendingAccessRequest: false,
      })
    );
    unmount();
  });

  it("HANDOFF_PROBE calls claimHandoffProbe when target matches session", async () => {
    storeSnapshot.account.sessionID = "next-holder";
    const { unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.HANDOFF_PROBE,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.HANDOFF_PROBE,
        collection,
        docID,
        probeTargetSessionID: "next-holder",
      });
    });

    expect(claimHandoffProbe).toHaveBeenCalledWith(collection, docID);
    unmount();
  });

  it("HANDOFF_PROBE does not claim when target mismatches session", async () => {
    storeSnapshot.account.sessionID = "me";
    const { unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.HANDOFF_PROBE,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.HANDOFF_PROBE,
        collection,
        docID,
        probeTargetSessionID: "someone-else",
      });
    });

    expect(claimHandoffProbe).not.toHaveBeenCalled();
    unmount();
  });

  it("VIEWER_JOINED increments viewerCount when session is another tab", async () => {
    storeSnapshot.account.sessionID = "me";
    storeSnapshot.documentLock.scopes[scopeKey] = {
      lockHeld: false,
      viewerCount: 2,
    };
    const { patch, unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.VIEWER_JOINED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.VIEWER_JOINED,
        collection,
        docID,
        sessionID: "other-viewer",
      });
    });

    expect(patch).toHaveBeenCalledWith({ viewerCount: 3 });
    unmount();
  });

  it("VIEWER_LEFT decrements viewerCount floored at zero", async () => {
    storeSnapshot.account.sessionID = "me";
    storeSnapshot.documentLock.scopes[scopeKey] = {
      lockHeld: false,
      viewerCount: 1,
    };
    const { patch, unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.VIEWER_LEFT,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.VIEWER_LEFT,
        collection,
        docID,
        sessionID: "other-viewer",
      });
    });

    expect(patch).toHaveBeenCalledWith({ viewerCount: 0 });
    unmount();
  });

  it("VIEWER_JOINED ignores echo for same sessionID", async () => {
    storeSnapshot.account.sessionID = "same-sess";
    storeSnapshot.documentLock.scopes[scopeKey] = { viewerCount: 5 };
    const { patch, unmount } = mountListener(false);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.VIEWER_JOINED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.VIEWER_JOINED,
        collection,
        docID,
        sessionID: "same-sess",
      });
    });

    expect(patch).not.toHaveBeenCalled();
    unmount();
  });

  it("GROUP_CASCADE clears scope when releases include this docID", async () => {
    const { patch, dispatchHeld, cancelReadOnlyGrace, unmount } = mountListener(true);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.GROUP_CASCADE,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.GROUP_CASCADE,
        collection: USER_JOBS_COLLECTION,
        releases: [{ docID: "other" }, { docID }],
      });
    });

    expect(cancelReadOnlyGrace).toHaveBeenCalled();
    expect(dispatchHeld).toHaveBeenCalledWith({
      type: DOCUMENT_LOCK_HELD_ACTIONS.SET,
      held: false,
    });
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({ lockHeld: false, readOnly: false })
    );
    unmount();
  });

  it("GROUP_CASCADE ignores when collection mismatches listener scope", async () => {
    const { patch, unmount } = mountListener(true);

    await act(async () => {
      dispatchLockEvent({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.GROUP_CASCADE,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.GROUP_CASCADE,
        collection: "job_groups",
        releases: [{ docID }],
      });
    });

    expect(patch).not.toHaveBeenCalled();
    unmount();
  });
});
