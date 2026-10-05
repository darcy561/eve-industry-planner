import { mergeScopedDocumentLockState } from "./documentLockScope.js";

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
    docID,
  );
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

/**
 * Drop IDs that are read-only for `collection` (held by another session).
 *
 * @param {*} state — root `usersStore` state
 * @param {string} collection
 * @param {Iterable<string>} docIDs
 * @returns {string[]}
 */
export function filterUnlockedDocumentIDs(state, collection, docIDs) {
  if (!collection || !docIDs) return [];
  const result = [];
  for (const docID of docIDs) {
    if (!docID) continue;
    if (selectDocumentLockReadOnly(state, collection, docID)) continue;
    result.push(docID);
  }
  return result;
}

/**
 * Whether a group still exists on the planner, which a job's `groupID` does not prove: an archived
 * or deleted group's jobs keep it.
 *
 * @param {*} state — root store state
 * @param {string | undefined | null} groupID
 * @param {boolean} [includedInGroup=true]
 * @returns {boolean}
 */
export function isJobInLiveGroup(state, groupID, includedInGroup = true) {
  if (!groupID || includedInGroup === false) return false;
  return Boolean(state?.jobData?.actions?.getGroupObject?.(groupID));
}
