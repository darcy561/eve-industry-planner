import useUsersStore from "../../Zustand/usersStore.js";
import { docLockScopeKey } from "./documentLockScope.js";
import { selectScopedDocumentLock } from "./documentLockSelectors.js";
import { endReadOnlyGraceIfApplicable } from "./readOnlyGrace.js";
import { LOCK_READONLY_GRACE_MS } from "./documentLockTimings.js";
import { numberOrNull } from "./documentLockStatusFields.js";

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
 * Maps a single `/document-locks/status` (or batch row) JSON payload into Zustand document-lock scope state.
 *
 * Lock-gone semantics: when `data.held` is false we PRESERVE the existing
 * scope's `readOnly` flag instead of forcing it to false, and arm a short
 * module-level grace timer that releases readOnly if no follow-up holder
 * appears. This avoids the "all cards flash editable" race on TTL expiry —
 * a TTL expiry is typically followed within ~ms by either a former-holder
 * `document_lock_acquired` or a server-side `document_lock_handoff_completed`
 * (waitlist promotion); both arrive as a fresh refetch with `held: true` and
 * cancel the grace inline. Voluntary-release events still clear readOnly
 * promptly because `useDocumentLock` patches `readOnly: false` directly when
 * it handles the released event, and the subsequent planner-sync refetch then
 * re-reads that post-release `false` (no grace armed because prev.readOnly is
 * already false). Planner-only scopes (no `useDocumentLock` attached) rely on
 * the grace timer alone, then become editable after the grace window.
 *
 * @param {string} collection
 * @param {string} docID
 * @param {Record<string, unknown>} data
 */
export function applyDocumentLockStatusFromPayload(collection, docID, data) {
  if (!docID || !data || typeof data !== "object") return;

  const sessionID = useUsersStore.getState().account.sessionID;
  const held = data.held === true;
  const holder =
    typeof data.holderSessionID === "string" ? data.holderSessionID : "";

  let readOnly = false;
  let lockHeld = false;
  if (held && holder) {
    if (sessionID && holder === sessionID) {
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
      docID
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
    lockExpiresAtUnix: held ? numberOrNull(data, "expiresAtUnix") : null,
    lockTtlSeconds: held ? numberOrNull(data, "ttlSeconds") : null,
  };
  // `viewerCount` is authoritative from the server — overwrite on every refresh
  // so out-of-band joins/leaves we missed (e.g. WS reconnect) self-heal here.
  if (typeof data.viewerCount === "number") {
    patch.viewerCount = data.viewerCount;
  }

  useUsersStore
    .getState()
    .documentLock.actions.patchDocumentLockForScope(collection, docID, patch);
}
