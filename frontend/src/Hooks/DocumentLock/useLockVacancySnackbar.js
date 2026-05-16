import { useEffect } from "react";
import { shouldSuppressDocumentLockVacancyNotice } from "../../Functions/DocumentLock/documentLockAcquireFeedback.js";
import {
  docLockScopeKey,
  scopeHasOtherSessionContention,
} from "../../Functions/DocumentLock/documentLockScope.js";
import {
  showSnackbarSuccess,
  showSnackbarWarning,
} from "../../Events/snackbarEvents.js";

/**
 * Snackbars for holder ↔ viewer transitions. Gained-ownership toasts are skipped
 * for uncontested solo acquires; lost-ownership and read-only → holder always
 * imply another session was involved.
 */
export function useLockVacancySnackbar({
  enabled,
  collection,
  docID,
  lockHeld,
  readOnly,
  waitingInHandoffQueue,
  viewerCount,
  waitlistLen,
  pendingAccessRequest,
  handoffPendingHolder,
  handoffOfferForMe,
  prevHolderUiRef,
  becameOwnerVacantMessage = "You now hold the edit lock — this tab is the editor.",
  lostOwnerMessage = "This tab is now read-only — another session holds the edit lock.",
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

    const becameHolderFromReadOnly =
      lockHeld && !readOnly && prev.readOnly && !prev.lockHeld;

    const lostHolderToViewer =
      !lockHeld && readOnly && prev.lockHeld && !prev.readOnly;

    const becameHolderFromVacant =
      lockHeld &&
      !readOnly &&
      !prev.lockHeld &&
      !prev.readOnly &&
      !becameHolderFromReadOnly;

    const contentionNow = scopeHasOtherSessionContention({
      readOnly,
      lockHeld,
      waitingInHandoffQueue,
      viewerCount,
      waitlistLen,
      pendingAccessRequest,
      handoffPendingHolder,
      handoffOfferForMe,
    });

    if (lostHolderToViewer) {
      showSnackbarWarning(lostOwnerMessage, 6);
    }

    const shouldNotifyOwnershipGained =
      !shouldSuppressDocumentLockVacancyNotice() &&
      (becameHolderFromReadOnly || contentionNow);

    if (becameHolderFromReadOnly && shouldNotifyOwnershipGained) {
      if (prev.waitingInHandoffQueue) {
        showSnackbarSuccess("Your edit access request was fulfilled.", 4);
      } else {
        showSnackbarSuccess(
          "Another editing session ended — you now have edit access.",
          4
        );
      }
    } else if (becameHolderFromVacant && shouldNotifyOwnershipGained) {
      showSnackbarSuccess(becameOwnerVacantMessage, 4);
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
    viewerCount,
    waitlistLen,
    pendingAccessRequest,
    handoffPendingHolder,
    handoffOfferForMe,
    prevHolderUiRef,
    becameOwnerVacantMessage,
    lostOwnerMessage,
  ]);
}
