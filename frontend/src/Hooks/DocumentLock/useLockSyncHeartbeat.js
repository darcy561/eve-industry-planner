import { useEffect } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import { selectScopedDocumentLock } from "../../Functions/DocumentLock/documentLockSelectors.js";
import {
  LOCK_EXPIRY_RESYNC_INTERVAL_MS,
  LOCK_EXPIRY_SLACK_SECONDS,
  LOCK_STATUS_SYNC_INTERVAL_MS,
} from "../../Functions/DocumentLock/documentLockTimings.js";

/**
 * Periodic `/lock-state` sync, post-expiry resync, visibility + online refresh.
 */
export function useLockSyncHeartbeat({
  enabled,
  docID,
  collection,
  syncLockFromServer,
  flushExtendLease,
}) {
  useEffect(() => {
    if (!enabled || !docID) return;
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      void syncLockFromServer();
      const scoped = selectScopedDocumentLock(
        useUsersStore.getState(),
        collection,
        docID
      );
      if (scoped.lockHeld && !scoped.readOnly) {
        flushExtendLease();
      }
    }
    function onOnline() {
      void syncLockFromServer();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, docID, collection, syncLockFromServer, flushExtendLease]);

  useEffect(() => {
    if (!enabled || !docID) return;
    const id = window.setInterval(() => {
      void syncLockFromServer();
    }, LOCK_STATUS_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, docID, syncLockFromServer]);

  useEffect(() => {
    if (!enabled || !docID) return;
    const id = window.setInterval(() => {
      const exp = selectScopedDocumentLock(
        useUsersStore.getState(),
        collection,
        docID
      ).lockExpiresAtUnix;
      if (exp == null || typeof exp !== "number") return;
      const now = Math.floor(Date.now() / 1000);
      if (now <= exp + LOCK_EXPIRY_SLACK_SECONDS) return;
      void syncLockFromServer();
    }, LOCK_EXPIRY_RESYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, docID, syncLockFromServer, collection]);
}
