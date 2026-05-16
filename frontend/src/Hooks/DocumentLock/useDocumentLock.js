import { useCallback, useRef } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import { selectScopedDocumentLock } from "../../Functions/DocumentLock/documentLockSelectors.js";
import { useDocumentLockHeld } from "./useDocumentLockHeld.js";
import { useLockAcquireRelease } from "./useLockAcquireRelease.js";
import { useLockExtendLoop } from "./useLockExtendLoop.js";
import { useLockExtendNudgeSnackbar } from "./useLockExtendNudgeSnackbar.js";
import { useLockReadOnlyGrace } from "./useLockReadOnlyGrace.js";
import { useLockSyncFromServer } from "./useLockSyncFromServer.js";
import { useLockSyncHeartbeat } from "./useLockSyncHeartbeat.js";
import { useLockPassiveViewerSnackbar } from "./useLockPassiveViewerSnackbar.js";
import { useLockVacancySnackbar } from "./useLockVacancySnackbar.js";
import { useLockViewerPresence } from "./useLockViewerPresence.js";
import { useLockWsListener } from "./useLockWsListener.js";

const DEFAULT_PENDING_ACCESS_SNACKBAR =
  "Another tab requested edit access for this document.";

/**
 * Per-tab document lock engine. Composes concern-specific sub-hooks (#10) and
 * a small `held` reducer (#16) for the imperative holder mirror used by
 * `/release` and WS holder checks.
 */
export function useDocumentLock(collection, docID, enabled, options = {}) {
  const pendingAccessRequestMessage =
    options.pendingAccessRequestMessage ?? DEFAULT_PENDING_ACCESS_SNACKBAR;
  const becameOwnerVacantMessage =
    options.becameOwnerVacantMessage ??
    "You now hold the edit lock — this tab is the editor.";
  const lostOwnerMessage =
    options.lostOwnerMessage ??
    "This tab is now read-only — another session holds the edit lock.";
  const extendNudgeMessage =
    options.extendNudgeMessage ??
    "Your edit session is about to end — renew now while this tab is visible.";
  const passiveViewerMessage = options.passiveViewerMessage;
  const lockHeld = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).lockHeld
  );
  const readOnly = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).readOnly
  );
  const waitingInHandoffQueue = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).waitingInHandoffQueue
  );
  const lockExpiresAtUnix = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).lockExpiresAtUnix
  );
  const handoffPendingHolder = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).handoffPendingHolder
  );
  const viewerCount = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).viewerCount
  );
  const waitlistLen = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).waitlistLen
  );
  const pendingAccessRequest = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).pendingAccessRequest
  );
  const handoffOfferForMe = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).handoffOfferForMe
  );
  const lockScopeBootstrapped = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).lockScopeBootstrapped ===
    true
  );
  const sessionID = useUsersStore((s) => s.account.sessionID);

  const { heldRef, dispatchHeld } = useDocumentLockHeld(lockHeld);
  const keyRef = useRef({ collection: "", docID: "" });
  const readOnlyGraceRef = useRef(null);
  const prevHolderUiRef = useRef({
    scopeKey: "",
    readOnly: false,
    lockHeld: false,
    waitingInHandoffQueue: false,
  });
  const prevPassiveViewerRef = useRef({
    scopeKey: "",
    viewerCount: 0,
    lockHeld: false,
    readOnly: true,
  });

  const patch = useCallback(
    (partial) => {
      if (!collection || !docID) return;
      useUsersStore
        .getState()
        .documentLock.actions.patchDocumentLockForScope(
          collection,
          docID,
          partial
        );
    },
    [collection, docID]
  );

  const resetScope = useCallback(() => {
    if (!collection || !docID) return;
    useUsersStore
      .getState()
      .documentLock.actions.resetDocumentLockForScope(collection, docID);
  }, [collection, docID]);

  const { cancelReadOnlyGrace, startReadOnlyGrace } = useLockReadOnlyGrace(
    readOnlyGraceRef,
    collection,
    docID
  );

  const { tryAcquire } = useLockAcquireRelease({
    collection,
    docID,
    enabled,
    lockHeld,
    readOnly,
    patch,
    resetScope,
    heldRef,
    dispatchHeld,
    keyRef,
    cancelReadOnlyGrace,
    waitingInHandoffQueue,
  });

  const { syncLockFromServer } = useLockSyncFromServer({
    collection,
    docID,
    enabled,
    patch,
    dispatchHeld,
    tryAcquire,
    startReadOnlyGrace,
  });

  const { flushExtendLease } = useLockExtendLoop({
    enabled,
    lockHeld,
    readOnly,
    patch,
    dispatchHeld,
    keyRef,
    syncLockFromServer,
  });

  useLockSyncHeartbeat({
    enabled,
    docID,
    collection,
    syncLockFromServer,
    flushExtendLease,
  });

  useLockViewerPresence({
    enabled,
    collection,
    docID,
    readOnly,
  });

  useLockExtendNudgeSnackbar({
    enabled,
    collection,
    docID,
    lockHeld,
    readOnly,
    lockExpiresAtUnix,
    handoffPendingHolder,
    extendNudgeMessage,
  });

  useLockPassiveViewerSnackbar({
    enabled,
    collection,
    docID,
    lockHeld,
    readOnly,
    lockScopeBootstrapped,
    viewerCount,
    prevPassiveViewerRef,
    passiveViewerMessage,
  });

  useLockVacancySnackbar({
    enabled,
    collection,
    docID,
    lockHeld,
    readOnly,
    waitingInHandoffQueue,
    viewerCount,
    waitlistLen,
    pendingAccessRequest,
    handoffPendingHolder,
    handoffOfferForMe,
    prevHolderUiRef,
    becameOwnerVacantMessage,
    lostOwnerMessage,
  });

  useLockWsListener({
    collection,
    docID,
    sessionID,
    pendingAccessRequestMessage,
    patch,
    syncLockFromServer,
    cancelReadOnlyGrace,
    heldRef,
    dispatchHeld,
  });
}
