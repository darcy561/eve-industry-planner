import { useCallback } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import { getDocumentLockState } from "../../Functions/Endpoints/Private/documentLockClient.js";
import { selectScopedDocumentLock } from "../../Functions/DocumentLock/documentLockSelectors.js";
import { numberOrNull } from "../../Functions/DocumentLock/documentLockStatusFields.js";
import { clearedHandoffState } from "./documentLockHookShared.js";
import { DOCUMENT_LOCK_HELD_ACTIONS } from "./documentLockHeldReducer.js";
import { myLockParticipantID } from "../../Functions/DocumentLock/lockParticipant.js";

/**
 * Reads one document's lock state from the server and patches the edit page's lock scope
 * as holder, viewer or neutral.
 */
export function useLockSyncFromServer({
  collection,
  docID,
  enabled,
  patch,
  dispatchHeld,
  tryAcquire,
  startReadOnlyGrace,
}) {
  const syncLockFromServer = useCallback(async () => {
    if (!enabled || !collection || !docID) return;

    const me = myLockParticipantID();
    try {
      const res = await getDocumentLockState(collection, docID);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));

      if (!data.held) {
        const prev = selectScopedDocumentLock(
          useUsersStore.getState(),
          collection,
          docID,
        );
        const viewerCountPatch =
          typeof data.viewerCount === "number"
            ? { viewerCount: data.viewerCount }
            : {};
        if (prev.lockHeld) {
          patch({
            lockHeld: false,
            heldByThisAccount: false,
            readOnly: false,
            pendingAccessRequest: false,
            lockExpiresAtUnix: null,
            lockTtlSeconds: null,
            ...clearedHandoffState(),
            ...viewerCountPatch,
          });
          dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
          if (prev.suppressVacancyAcquire !== true) {
            void tryAcquire();
          }
          return;
        }
        if (prev.readOnly) {
          patch({
            lockHeld: false,
            heldByThisAccount: false,
            pendingAccessRequest: false,
            lockExpiresAtUnix: null,
            lockTtlSeconds: null,
            ...clearedHandoffState(),
            ...viewerCountPatch,
          });
          dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
          startReadOnlyGrace();
          return;
        }
        patch({
          lockHeld: false,
          heldByThisAccount: false,
          readOnly: false,
          pendingAccessRequest: false,
          lockExpiresAtUnix: null,
          lockTtlSeconds: null,
          ...clearedHandoffState(),
          ...viewerCountPatch,
        });
        dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
        return;
      }

      const holder = data.holderParticipantID;
      const pendingTarget =
        typeof data.probeTargetParticipantID === "string"
          ? data.probeTargetParticipantID
          : null;
      const pendingExpires = numberOrNull(data, "probeExpiresAtUnix");
      if (me && holder === me) {
        dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: true });
        const holderPatch = {
          lockHeld: true,
          heldByThisAccount: true,
          readOnly: false,
          waitingInHandoffQueue: false,
          lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
          lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
          extendSegmentCount: numberOrNull(data, "extendCount"),
          waitlistLen: numberOrNull(data, "waitlistLen"),
          handoffPendingHolder: pendingTarget != null && pendingTarget !== "",
          pendingHandoffOfferParticipantID: pendingTarget,
          pendingHandoffExpiresAtUnix: pendingExpires,
          handoffOfferForMe: false,
        };
        if (typeof data.viewerCount === "number") {
          holderPatch.viewerCount = data.viewerCount;
        }
        patch(holderPatch);
        return;
      }

      dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
      const viewerPatch = {
        readOnly: true,
        lockHeld: false,
        heldByThisAccount: data.heldByThisAccount === true,
        lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
        lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
        extendSegmentCount: numberOrNull(data, "extendCount"),
        waitlistLen: numberOrNull(data, "waitlistLen"),
        handoffPendingHolder: false,
        pendingHandoffOfferParticipantID: pendingTarget,
        pendingHandoffExpiresAtUnix: pendingExpires,
        handoffOfferForMe: false,
      };
      if (typeof data.viewerCount === "number") {
        viewerPatch.viewerCount = data.viewerCount;
      }
      patch(viewerPatch);
    } catch {}
  }, [
    collection,
    docID,
    enabled,
    patch,
    startReadOnlyGrace,
    tryAcquire,
    dispatchHeld,
  ]);

  return { syncLockFromServer };
}
