import { useCallback } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import { getDocumentLockState } from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import { selectScopedDocumentLock } from "../../Functions/DocumentLock/documentLockSelectors.js";
import { numberOrNull } from "../../Functions/DocumentLock/documentLockStatusFields.js";
import { clearedHandoffState } from "./documentLockHookShared.js";
import { DOCUMENT_LOCK_HELD_ACTIONS } from "./documentLockHeldReducer.js";

/**
 * GET /lock-state (via client) → Zustand scope patch; drives holder/viewer/neutral
 * branches and read-only grace after TTL-shaped races.
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

    const mySessionID = useUsersStore.getState()?.account?.sessionID;
    try {
      const res = await getDocumentLockState(collection, docID);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));

      if (!data.held) {
        const prev = selectScopedDocumentLock(
          useUsersStore.getState(),
          collection,
          docID
        );
        const viewerCountPatch =
          typeof data.viewerCount === "number"
            ? { viewerCount: data.viewerCount }
            : {};
        if (prev.lockHeld) {
          patch({
            lockHeld: false,
            readOnly: false,
            pendingAccessRequest: false,
            lockExpiresAtUnix: null,
            lockTtlSeconds: null,
            ...clearedHandoffState(),
            ...viewerCountPatch,
          });
          dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
          void tryAcquire();
          return;
        }
        if (prev.readOnly) {
          patch({
            lockHeld: false,
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

      const holder = data.holderSessionID;
      const pendingTarget =
        typeof data.probeTargetSessionID === "string"
          ? data.probeTargetSessionID
          : typeof data.pendingHandoffTargetSessionID === "string"
            ? data.pendingHandoffTargetSessionID
            : null;
      const pendingExpires =
        numberOrNull(data, "probeExpiresAtUnix") ??
        numberOrNull(data, "pendingHandoffExpiresAtUnix");
      if (mySessionID && holder === mySessionID) {
        dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: true });
        const holderPatch = {
          lockHeld: true,
          readOnly: false,
          waitingInHandoffQueue: false,
          lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
          lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
          extendSegmentCount: numberOrNull(data, "extendCount"),
          waitlistLen: numberOrNull(data, "waitlistLen"),
          handoffPendingHolder: pendingTarget != null && pendingTarget !== "",
          pendingHandoffOfferClientID: pendingTarget,
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
        lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
        lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
        extendSegmentCount: numberOrNull(data, "extendCount"),
        waitlistLen: numberOrNull(data, "waitlistLen"),
        handoffPendingHolder: false,
        pendingHandoffOfferClientID: pendingTarget,
        pendingHandoffExpiresAtUnix: pendingExpires,
        handoffOfferForMe: false,
      };
      if (typeof data.viewerCount === "number") {
        viewerPatch.viewerCount = data.viewerCount;
      }
      patch(viewerPatch);
    } catch {
      /* ignore */
    }
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
