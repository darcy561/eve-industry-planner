import { useEffect } from "react";
import { shouldSuppressDocumentLockVacancyNotice } from "../../Functions/DocumentLock/documentLockAcquireFeedback.js";
import { docLockScopeKey } from "../../Functions/DocumentLock/documentLockScope.js";
import { showSnackbarSuccess } from "../../Events/snackbarEvents.js";

/**
 * Snackbar when we become holder after read-only (request fulfilled vs session ended).
 */
export function useLockVacancySnackbar({
  enabled,
  collection,
  docID,
  lockHeld,
  readOnly,
  waitingInHandoffQueue,
  prevHolderUiRef,
}) {
  useEffect(() => {
    if (!enabled || !collection || !docID) {
      prevHolderUiRef.current = {
        scopeKey: "",
        readOnly: false,
        lockHeld: false,
        waitingInHandoffQueue: false,
      };
      return;
    }

    const scopeKey = docLockScopeKey(collection, docID);
    const prev = prevHolderUiRef.current;

    if (prev.scopeKey !== scopeKey) {
      prevHolderUiRef.current = {
        scopeKey,
        readOnly,
        lockHeld,
        waitingInHandoffQueue,
      };
      return;
    }

    const becameHolder =
      lockHeld && !readOnly && prev.readOnly && !prev.lockHeld;

    if (becameHolder && !shouldSuppressDocumentLockVacancyNotice()) {
      if (prev.waitingInHandoffQueue) {
        showSnackbarSuccess("Your edit access request was fulfilled.", 4);
      } else {
        showSnackbarSuccess(
          "Another editing session ended — you now have edit access.",
          4
        );
      }
    }

    prevHolderUiRef.current = {
      scopeKey,
      readOnly,
      lockHeld,
      waitingInHandoffQueue,
    };
  }, [
    enabled,
    collection,
    docID,
    lockHeld,
    readOnly,
    waitingInHandoffQueue,
    prevHolderUiRef,
  ]);
}
