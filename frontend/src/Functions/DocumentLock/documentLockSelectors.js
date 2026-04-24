import {
  docLockScopeKey,
  mergeScopedDocumentLockState,
} from "./documentLockScope.js";

/**
 * Full merged UI state for one Redis-backed document lock scope.
 *
 * @param {*} state — root `usersStore` state
 * @param {string} collection
 * @param {string} docID
 */
export function selectScopedDocumentLock(state, collection, docID) {
  return mergeScopedDocumentLockState(
    state.documentLock.scopes,
    collection,
    docID
  );
}

/**
 * Whether this scope row exists in the store (first patch created it).
 *
 * @param {*} state
 * @param {string} collection
 * @param {string} docID
 */
export function isDocumentLockScopeTracked(state, collection, docID) {
  if (!collection || !docID) return false;
  const key = docLockScopeKey(collection, docID);
  return Object.hasOwn(state.documentLock.scopes, key);
}

/**
 * Read-only because another session holds the lock for this collection/doc pair.
 *
 * @param {*} state — root `usersStore` state
 * @param {string} collection
 * @param {string} docID
 */
export function selectDocumentLockReadOnly(state, collection, docID) {
  return selectScopedDocumentLock(state, collection, docID).readOnly;
}
