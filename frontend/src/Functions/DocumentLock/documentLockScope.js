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
