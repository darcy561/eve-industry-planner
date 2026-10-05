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
import { myLockParticipantID } from "../../Functions/DocumentLock/lockParticipant.js";

/** `eip-document-lock` CustomEvent → patch / sync / claim / snackbar. */
export function useLockWsListener({
  collection,
  docID,
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

      if (payload.collection !== collection || payload.docID !== docID) return;
      if (t === DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED) {
        if (!payload.requesterParticipantID) return;
        const scope = selectScopedDocumentLock(
          useUsersStore.getState(),
          collection,
          docID,
        );
        const isHolder = scope.lockHeld === true || heldRef.current === true;
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
        const me = myLockParticipantID();
        const target = payload.probeTargetParticipantID;
        if (target && me && target === me) {
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
        cancelReadOnlyGrace();
        const scope = selectScopedDocumentLock(
          useUsersStore.getState(),
          collection,
          docID,
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
        if (
          payload.participantID &&
          payload.participantID === myLockParticipantID()
        ) {
          return;
        }
        const cur = selectScopedDocumentLock(
          useUsersStore.getState(),
          collection,
          docID,
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
    heldRef,
    dispatchHeld,
  ]);
}
