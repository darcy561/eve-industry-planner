import { useEffect } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  postDocumentLockViewerArrived,
  postDocumentLockViewerDeparted,
  sendDocumentLockViewerDepartedBeacon,
} from "../../Functions/Endpoints/Private/documentLockClient.js";
import { selectScopedDocumentLock } from "../../Functions/DocumentLock/documentLockSelectors.js";

/**
 * Passive viewer `/viewer-arrived` / `/viewer-departed` + `sendBeacon` on `pagehide`.
 * Queued waitlist tabs with the job open count as viewing even when `readOnly` is
 * briefly false (e.g. after `request` 202 before acquire, or read-only grace).
 */
export function useLockViewerPresence({
  enabled,
  collection,
  docID,
  readOnly,
  waitingInHandoffQueue,
  releaseOnUnmount = true,
}) {
  const registerAsViewer = readOnly || waitingInHandoffQueue;

  useEffect(() => {
    if (!enabled || !collection || !docID || !registerAsViewer) return undefined;
    void postDocumentLockViewerArrived(collection, docID).catch(() => {});
    function onPageHide() {
      sendDocumentLockViewerDepartedBeacon(collection, docID);
    }
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      const scope = selectScopedDocumentLock(
        useUsersStore.getState(),
        collection,
        docID
      );
      if (!releaseOnUnmount) return;
      if (scope.lockHeld && !scope.readOnly) {
        return;
      }
      void postDocumentLockViewerDeparted(collection, docID).catch(() => {});
    };
  }, [enabled, collection, docID, registerAsViewer, releaseOnUnmount]);
}
