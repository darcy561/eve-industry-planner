import { documentLockKey } from "./documentLockKey.js";

/** Re-export for call sites that prefer “scope” wording ({@link ../Hooks/useDocumentLock.js}). */
export function docLockScopeKey(collection, docID) {
  return documentLockKey(collection, docID);
}

/** @typedef {Object} ScopedDocumentLockState */

/** @returns {ScopedDocumentLockState} */
export function initialScopedDocumentLockState() {
  return {
    readOnly: false,
    lockHeld: false,
    pendingAccessRequest: false,
    lockExpiresAtUnix: null,
    lockTtlSeconds: null,
    extendSegmentCount: null,
    waitlistLen: null,
    handoffPendingHolder: false,
    pendingHandoffOfferClientID: null,
    pendingHandoffExpiresAtUnix: null,
    handoffOfferForMe: false,
    waitingInHandoffQueue: false,
    /**
     * Number of passive-viewer sessions currently registered on this doc. Driven by
     * `document_lock_viewer_joined` / `document_lock_viewer_left` events and refreshed
     * authoritatively by every `/status` response — the holder shows their header
     * affordance when this is > 0 even if nobody has clicked "Request access".
     */
    viewerCount: 0,
    /**
     * Set after the first `useDocumentLock` acquire attempt for this scope so the
     * header does not flash the vacant/orphan affordance during bootstrap.
     */
    lockScopeBootstrapped: false,
  };
}

/**
 * @param {Record<string, ScopedDocumentLockState>} scopes
 * @param {string} collection
 * @param {string} docID
 */
export function mergeScopedDocumentLockState(scopes, collection, docID) {
  if (!collection || !docID) return initialScopedDocumentLockState();
  const key = documentLockKey(collection, docID);
  return {
    ...initialScopedDocumentLockState(),
    ...(scopes[key] ?? {}),
  };
}

/**
 * True when another session is involved on this doc (waitlist, viewers, handoff,
 * or this tab is read-only because someone else holds the lock). Used for the
 * header lock affordance and to avoid ownership snackbars for uncontested editors.
 *
 * @param {ScopedDocumentLockState} st
 */
export function scopeHasOtherSessionContention(st) {
  if (!st) return false;
  if (st.readOnly) return true;
  if (st.handoffPendingHolder) return true;
  if (st.pendingAccessRequest) return true;
  if (typeof st.waitlistLen === "number" && st.waitlistLen > 0) return true;
  if (st.waitingInHandoffQueue) return true;
  if (st.handoffOfferForMe) return true;
  if (typeof st.viewerCount === "number" && st.viewerCount > 0) return true;
  return false;
}
