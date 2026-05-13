import { useCallback, useRef } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import { selectScopedDocumentLock } from "../../Functions/DocumentLock/documentLockSelectors.js";
import { useDocumentLockHeld } from "./useDocumentLockHeld.js";
import { useLockAcquireRelease } from "./useLockAcquireRelease.js";
import { useLockExtendLoop } from "./useLockExtendLoop.js";
import { useLockReadOnlyGrace } from "./useLockReadOnlyGrace.js";
import { useLockSyncFromServer } from "./useLockSyncFromServer.js";
import { useLockSyncHeartbeat } from "./useLockSyncHeartbeat.js";
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
  const lockHeld = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).lockHeld
  );
  const readOnly = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).readOnly
  );
  const waitingInHandoffQueue = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).waitingInHandoffQueue
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

  useLockVacancySnackbar({
    enabled,
    collection,
    docID,
    lockHeld,
    readOnly,
    waitingInHandoffQueue,
    prevHolderUiRef,
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
