import { useEffect, useRef } from "react";
import { scopeHasLeasePressure } from "../../Functions/DocumentLock/documentLockScope.js";

/**
 * Derives whether the holder should run contested lease renewals (/extend, nudges).
 */
export function useLeasePressureFromScope(scope) {
  return scopeHasLeasePressure(scope);
}

/**
 * When contention appears or clears, resync from the server so Zustand picks up
 * the rebind (contested 5 min or solo 24 h). Does not call `/extend` — the server
 * already reset the segment on viewer-arrived / depart; the holder extend loop
 * runs on its normal interval while contested.
 */
export function useLockLeaseContentionEffects({
  enabled,
  collection,
  docID,
  lockHeld,
  readOnly,
  leasePressure,
  syncLockFromServer,
}) {
  const prevPressureRef = useRef(false);

  useEffect(() => {
    if (!enabled || !collection || !docID || !lockHeld || readOnly) {
      prevPressureRef.current = false;
      return;
    }
    const prev = prevPressureRef.current;
    prevPressureRef.current = leasePressure;
    if (leasePressure !== prev) {
      void syncLockFromServer();
    }
  }, [
    enabled,
    collection,
    docID,
    lockHeld,
    readOnly,
    leasePressure,
    syncLockFromServer,
  ]);
}
