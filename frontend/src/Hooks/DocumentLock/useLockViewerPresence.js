import { useEffect } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  postDocumentLockViewerArrived,
  postDocumentLockViewerDeparted,
  sendDocumentLockViewerDepartedBeacon,
} from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import { selectScopedDocumentLock } from "../../Functions/DocumentLock/documentLockSelectors.js";

/**
 * Passive viewer `/viewer-arrived` / `/viewer-departed` + `sendBeacon` on `pagehide`.
 */
export function useLockViewerPresence({
  enabled,
  collection,
  docID,
  readOnly,
}) {
  useEffect(() => {
    if (!enabled || !collection || !docID || !readOnly) return undefined;
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
      if (scope.lockHeld && !scope.readOnly) {
        return;
      }
      void postDocumentLockViewerDeparted(collection, docID).catch(() => {});
    };
  }, [enabled, collection, docID, readOnly]);
}
