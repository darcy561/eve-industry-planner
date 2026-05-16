import { useCallback, useEffect, useRef } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  acquireDocumentLock,
  releaseDocumentLock,
} from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import {
  buildGrantedHolderPatch,
  numberOrNull,
} from "../../Functions/DocumentLock/documentLockStatusFields.js";
import { LOCK_WAITLIST_PULSE_INTERVAL_MS } from "../../Functions/DocumentLock/documentLockTimings.js";
import { DOCUMENT_LOCK_HELD_ACTIONS } from "./documentLockHeldReducer.js";

/**
 * Mount acquire, unmount release, key tracking, waitlist pulse while queued.
 *
 * `lockHeld` / `readOnly` enable edge-triggered self-heal when the scope would
 * otherwise be vacant-but-editable (#21).
 */
export function useLockAcquireRelease({
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
}) {
  const acquireInFlightRef = useRef(false);
  useEffect(() => {
    if (enabled && collection && docID) {
      keyRef.current = { collection, docID };
    } else if (!enabled || !docID) {
      keyRef.current = { collection: "", docID: "" };
    }
  }, [enabled, collection, docID, keyRef]);

  const release = useCallback(async () => {
    const { collection: c, docID: d } = keyRef.current;
    if (!c || !d || !heldRef.current) return;
    dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
    patch({
      lockHeld: false,
      lockExpiresAtUnix: null,
      lockTtlSeconds: null,
    });
    try {
      await releaseDocumentLock(c, d);
    } catch {
      /* ignore */
    }
  }, [patch, heldRef, keyRef, dispatchHeld]);

  const tryAcquire = useCallback(async () => {
    if (!enabled || !collection || !docID) return;

    keyRef.current = { collection, docID };
    try {
      const res = await acquireDocumentLock(collection, docID);
      const data = await res.json().catch(() => ({}));
      if (res.status === 201) {
        dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: true });
        patch(buildGrantedHolderPatch(data, { withClearedHandoff: true }));
        return;
      }
      if (
        (res.status === 200 &&
          data.held === true &&
          data.acquired !== true) ||
        res.status === 409
      ) {
        dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
        const readOnlyPatch = {
          readOnly: true,
          lockHeld: false,
          lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
          lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
        };
        if (typeof data.viewerCount === "number") {
          readOnlyPatch.viewerCount = data.viewerCount;
        }
        patch(readOnlyPatch);
        return;
      }
      patch({
        readOnly: false,
        lockExpiresAtUnix: null,
        lockTtlSeconds: null,
      });
    } catch {
      patch({
        readOnly: false,
        lockExpiresAtUnix: null,
        lockTtlSeconds: null,
      });
    }
  }, [collection, docID, enabled, patch, dispatchHeld]);

  const runTryAcquireGuarded = useCallback(async () => {
    if (acquireInFlightRef.current) return;
    acquireInFlightRef.current = true;
    try {
      await tryAcquire();
    } finally {
      acquireInFlightRef.current = false;
    }
  }, [tryAcquire]);

  useEffect(() => {
    if (!enabled || !waitingInHandoffQueue) return undefined;
    const pulse = () => {
      if (!collection || !docID) return;
      void useUsersStore
        .getState()
        .documentLock.actions.pulseWaitlist(collection, docID);
    };
    pulse();
    const id = window.setInterval(pulse, LOCK_WAITLIST_PULSE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, waitingInHandoffQueue, collection, docID]);

  useEffect(() => {
    if (!enabled || !docID) {
      cancelReadOnlyGrace();
      resetScope();
      dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
      keyRef.current = { collection: "", docID: "" };
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        if (!cancelled) await runTryAcquireGuarded();
      } finally {
        if (!cancelled) {
          patch({ lockScopeBootstrapped: true });
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelReadOnlyGrace();
      void release();
      resetScope();
      dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
      keyRef.current = { collection: "", docID: "" };
    };
  }, [
    enabled,
    docID,
    collection,
    runTryAcquireGuarded,
    release,
    resetScope,
    cancelReadOnlyGrace,
    dispatchHeld,
    keyRef,
  ]);

  // #21 — never stay "editable" without either the lease or read-only viewer state.
  useEffect(() => {
    if (!enabled || !collection || !docID) return;
    if (lockHeld || readOnly) return;
    void runTryAcquireGuarded();
  }, [
    enabled,
    collection,
    docID,
    lockHeld,
    readOnly,
    runTryAcquireGuarded,
  ]);

  return { tryAcquire, release };
}
