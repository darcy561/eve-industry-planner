import useUsersStore from "../../Zustand/usersStore.js";
import { docLockScopeKey } from "./documentLockScope.js";
import { selectScopedDocumentLock } from "./documentLockSelectors.js";
import { endReadOnlyGraceIfApplicable } from "./readOnlyGrace.js";
import { LOCK_READONLY_GRACE_MS } from "./documentLockTimings.js";
import { numberOrNull } from "./documentLockStatusFields.js";
import { myLockParticipantID } from "./lockParticipant.js";

/** Per-(collection, docID) pending grace timer ids. Module-level so planner-only
 *  scopes (no `useDocumentLock` attached) still self-heal. */
const gracePending = new Map();

function cancelLockGrace(collection, docID) {
  const key = docLockScopeKey(collection, docID);
  const timeoutId = gracePending.get(key);
  if (timeoutId != null) {
    window.clearTimeout(timeoutId);
    gracePending.delete(key);
  }
}

function startLockGrace(collection, docID) {
  const key = docLockScopeKey(collection, docID);
  cancelLockGrace(collection, docID);
  const timeoutId = window.setTimeout(() => {
    gracePending.delete(key);
    endReadOnlyGraceIfApplicable(collection, docID);
  }, LOCK_READONLY_GRACE_MS);
  gracePending.set(key, timeoutId);
}

/**
 * Writes one lock-state payload into the document-lock scope, keeping it read-only briefly
 * when the lock disappears so a following holder does not flash editable.
 *
 * @param {string} collection
 * @param {string} docID
 * @param {Record<string, unknown>} data
 */
export function applyDocumentLockStatusFromPayload(collection, docID, data) {
  if (!docID || !data || typeof data !== "object") return;

  const me = myLockParticipantID();
  const held = data.held === true;
  const holder =
    typeof data.holderParticipantID === "string"
      ? data.holderParticipantID
      : "";

  let readOnly;
  let lockHeld;
  if (held && holder) {
    if (me && holder === me) {
      lockHeld = true;
      readOnly = false;
    } else {
      readOnly = true;
      lockHeld = false;
    }
    cancelLockGrace(collection, docID);
  } else {
    const prev = selectScopedDocumentLock(
      useUsersStore.getState(),
      collection,
      docID,
    );
    readOnly = prev.readOnly === true;
    lockHeld = false;
    if (readOnly) {
      startLockGrace(collection, docID);
    } else {
      cancelLockGrace(collection, docID);
    }
  }

  const patch = {
    readOnly,
    lockHeld,
    heldByThisAccount: held ? data.heldByThisAccount === true : false,
    lockExpiresAtUnix: held ? numberOrNull(data, "expiresAtUnix") : null,
    lockTtlSeconds: held ? numberOrNull(data, "ttlSeconds") : null,
  };
  if (typeof data.viewerCount === "number") {
    patch.viewerCount = data.viewerCount;
  }
  const extendCount = numberOrNull(data, "extendCount");
  if (extendCount !== null) {
    patch.extendSegmentCount = extendCount;
  }
  const waitlistLen = numberOrNull(data, "waitlistLen");
  if (waitlistLen !== null) {
    patch.waitlistLen = waitlistLen;
  }

  useUsersStore
    .getState()
    .documentLock.actions.patchDocumentLockForScope(collection, docID, patch);
}
