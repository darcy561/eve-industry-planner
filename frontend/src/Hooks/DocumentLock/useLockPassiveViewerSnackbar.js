import { useEffect } from "react";
import { docLockScopeKey } from "../../Functions/DocumentLock/documentLockScope.js";
import { showSnackbarInfo } from "../../Events/snackbarEvents.js";

function normalizeViewerCount(viewerCount) {
  return typeof viewerCount === "number" && viewerCount > 0
    ? Math.floor(viewerCount)
    : 0;
}

/**
 * Holder-only: one info toast when passive viewers go from none → at least one.
 * Does not fire again when the count increases (1 → 2, etc.).
 */
export function useLockPassiveViewerSnackbar({
  enabled,
  collection,
  docID,
  lockHeld,
  readOnly,
  lockScopeBootstrapped,
  viewerCount,
  prevPassiveViewerRef,
  passiveViewerMessage,
}) {
  useEffect(() => {
    if (!enabled || !collection || !docID) {
      prevPassiveViewerRef.current = {
        scopeKey: "",
        viewerCount: 0,
        lockHeld: false,
        readOnly: true,
      };
      return;
    }

    const scopeKey = docLockScopeKey(collection, docID);
    const count = normalizeViewerCount(viewerCount);
    const prev = prevPassiveViewerRef.current;

    if (prev.scopeKey !== scopeKey) {
      prevPassiveViewerRef.current = {
        scopeKey,
        viewerCount: count,
        lockHeld,
        readOnly,
      };
      return;
    }

    const isHolder = lockHeld && !readOnly;
    const wasHolder = prev.lockHeld && !prev.readOnly;
    const prevCount = normalizeViewerCount(prev.viewerCount);
    const soloToWatching =
      lockScopeBootstrapped &&
      isHolder &&
      wasHolder &&
      prevCount === 0 &&
      count > 0;

    if (soloToWatching) {
      const message =
        typeof passiveViewerMessage === "function"
          ? passiveViewerMessage(count)
          : passiveViewerMessage ??
            (count === 1
              ? "Another session is viewing this document — you still hold the edit lock."
              : `${count} other sessions are viewing this document — you still hold the edit lock.`);
      showSnackbarInfo(message, 5);
    }

    prevPassiveViewerRef.current = {
      scopeKey,
      viewerCount: count,
      lockHeld,
      readOnly,
    };
  }, [
    enabled,
    collection,
    docID,
    lockHeld,
    readOnly,
    lockScopeBootstrapped,
    viewerCount,
    prevPassiveViewerRef,
    passiveViewerMessage,
  ]);
}
