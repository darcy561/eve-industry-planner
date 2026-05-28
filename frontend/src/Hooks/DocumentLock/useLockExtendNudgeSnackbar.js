import { useEffect, useRef, useState } from "react";
import { showDocumentLockExtendNudgeSnackbar } from "../../Events/snackbarEvents.js";
import { LOCK_LOW_REMAINING_NUDGE_SEC } from "../../Functions/DocumentLock/documentLockTimings.js";

/**
 * Holder-only snackbar when the lease is almost up. Runs inside `useDocumentLock`
 * so it still fires when the header lock icon is hidden (uncontested editor).
 * Uses `LOCK_LOW_REMAINING_NUDGE_SEC` from `documentLockTimings.js` (same band as the header pulse).
 */
export function useLockExtendNudgeSnackbar({
  enabled,
  collection,
  docID,
  lockHeld,
  readOnly,
  leasePressure,
  lockExpiresAtUnix,
  handoffPendingHolder,
  extendNudgeMessage,
}) {
  const belowLowRef = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !collection || !docID) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [enabled, collection, docID]);

  useEffect(() => {
    if (!enabled || !collection || !docID) {
      belowLowRef.current = false;
      return;
    }
    if (!lockHeld || readOnly || handoffPendingHolder || !leasePressure) {
      belowLowRef.current = false;
      return;
    }
    const remaining =
      lockExpiresAtUnix != null && typeof lockExpiresAtUnix === "number"
        ? Math.max(0, lockExpiresAtUnix - Math.floor(Date.now() / 1000))
        : null;
    const low =
      remaining != null &&
      remaining > 0 &&
      remaining <= LOCK_LOW_REMAINING_NUDGE_SEC;
    if (!low) {
      belowLowRef.current = false;
      return;
    }
    if (!belowLowRef.current) {
      belowLowRef.current = true;
      showDocumentLockExtendNudgeSnackbar(extendNudgeMessage, {
        collection,
        docID,
      });
    }
  }, [
    enabled,
    collection,
    docID,
    lockHeld,
    readOnly,
    lockExpiresAtUnix,
    handoffPendingHolder,
    leasePressure,
    extendNudgeMessage,
    tick,
  ]);
}
