import { useEffect } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import { showDocumentLockAccessRequestSnackbar } from "../../Events/snackbarEvents.js";
import { selectScopedDocumentLock } from "../../Functions/DocumentLock/documentLockSelectors.js";
import {
  DOCUMENT_LOCK_CUSTOM_EVENT,
  DOCUMENT_LOCK_DOMAIN_EVENTS,
} from "../../Functions/DocumentLock/documentLockEvents.js";
import { clearedHandoffState } from "./documentLockHookShared.js";
import { DOCUMENT_LOCK_HELD_ACTIONS } from "./documentLockHeldReducer.js";

/**
 * `eip-document-lock` CustomEvent → patch / sync / claim / snackbar.
 */
export function useLockWsListener({
  collection,
  docID,
  sessionID,
  pendingAccessRequestMessage,
  patch,
  syncLockFromServer,
  cancelReadOnlyGrace,
  heldRef,
  dispatchHeld,
}) {
  useEffect(() => {
    function onLockEvent(ev) {
      const payload = ev?.detail;
      if (!payload || typeof payload !== "object") return;

      const t = payload.event ?? payload.type;

      if (t === DOCUMENT_LOCK_DOMAIN_EVENTS.GROUP_CASCADE) {
        if (
          payload.collection !== collection ||
          !Array.isArray(payload.releases)
        ) {
          return;
        }
        const hit = payload.releases.some(
          (r) => r && r.docID === docID
        );
        if (!hit) return;
        cancelReadOnlyGrace();
        patch({
          lockHeld: false,
          readOnly: false,
          pendingAccessRequest: false,
          lockExpiresAtUnix: null,
          lockTtlSeconds: null,
          ...clearedHandoffState(),
        });
        dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
        return;
      }

      if (payload.collection !== collection || payload.docID !== docID) return;
      if (t === DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED) {
        // `requesterSessionID` is the JWT session id — shared across tabs; do not
        // compare to `mySessionID`. Holder detection must use Zustand `lockHeld`
        // (not only `heldRef`): `heldRef` is synced from the store in `useEffect`,
        // so it can still be false for a tick after acquire/sync while WS arrives.
        if (!payload.requesterSessionID) return;
        const scope = selectScopedDocumentLock(
          useUsersStore.getState(),
          collection,
          docID
        );
        const isHolder =
          scope.lockHeld === true || heldRef.current === true;
        if (!isHolder) return;
        patch({ pendingAccessRequest: true });
        showDocumentLockAccessRequestSnackbar(pendingAccessRequestMessage, {
          collection,
          docID,
        });
        return;
      }

      if (t === DOCUMENT_LOCK_DOMAIN_EVENTS.EXPIRED) {
        void syncLockFromServer();
        return;
      }
      if (t === DOCUMENT_LOCK_DOMAIN_EVENTS.HANDOFF_PROBE) {
        const mySessionID = useUsersStore.getState()?.account?.sessionID;
        const target =
          typeof payload.probeTargetSessionID === "string"
            ? payload.probeTargetSessionID
            : payload.offeredSessionID;
        if (target && mySessionID && target === mySessionID) {
          void useUsersStore
            .getState()
            .documentLock.actions.claimHandoffProbe(collection, docID);
        }
        return;
      }
      if (t === DOCUMENT_LOCK_DOMAIN_EVENTS.HANDOFF_COMPLETED) {
        cancelReadOnlyGrace();
        void syncLockFromServer();
        return;
      }
      if (t === DOCUMENT_LOCK_DOMAIN_EVENTS.RELEASED) {
        // `reason` is `holder_release` on voluntary POST /release (see
        // `DOCUMENT_LOCK_RELEASE_REASONS.HOLDER_RELEASE`); `hand_over_no_queue` on
        // /hand-over fallback. Legacy servers omitted `reason` — same patch path.
        cancelReadOnlyGrace();
        const scope = selectScopedDocumentLock(
          useUsersStore.getState(),
          collection,
          docID
        );
        patch({
          lockHeld: false,
          readOnly: false,
          pendingAccessRequest: false,
          lockExpiresAtUnix: null,
          lockTtlSeconds: null,
          suppressVacancyAcquire: scope.suppressVacancyAcquire === true,
          ...clearedHandoffState(),
        });
        dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
        return;
      }
      if (t === DOCUMENT_LOCK_DOMAIN_EVENTS.ACQUIRED) {
        cancelReadOnlyGrace();
        void syncLockFromServer();
        return;
      }
      if (
        t === DOCUMENT_LOCK_DOMAIN_EVENTS.VIEWER_JOINED ||
        t === DOCUMENT_LOCK_DOMAIN_EVENTS.VIEWER_LEFT
      ) {
        const mySessionID = useUsersStore.getState()?.account?.sessionID;
        if (payload.sessionID && payload.sessionID === mySessionID) return;
        const cur = selectScopedDocumentLock(
          useUsersStore.getState(),
          collection,
          docID
        );
        const prev = typeof cur.viewerCount === "number" ? cur.viewerCount : 0;
        const next =
          t === DOCUMENT_LOCK_DOMAIN_EVENTS.VIEWER_JOINED
            ? prev + 1
            : Math.max(0, prev - 1);
        patch({ viewerCount: next });
      }
    }
    window.addEventListener(DOCUMENT_LOCK_CUSTOM_EVENT, onLockEvent);
    return () =>
      window.removeEventListener(DOCUMENT_LOCK_CUSTOM_EVENT, onLockEvent);
  }, [
    collection,
    docID,
    syncLockFromServer,
    patch,
    cancelReadOnlyGrace,
    pendingAccessRequestMessage,
    sessionID,
    heldRef,
    dispatchHeld,
  ]);
}
