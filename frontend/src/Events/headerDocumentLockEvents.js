import useUsersStore from "../Zustand/usersStore.js";

/**
 * @typedef {Object} HeaderDocumentLockUIRegistration
 * @property {string} collection — e.g. `account_job_groups` (see documentLockCollections)
 * @property {string} docID
 * @property {boolean} [enabled=true] — when false, this row is skipped for the primary header control
 * @property {string} [readOnlyMessage] — copy for read-only popover; default in the control if omitted
 * @property {string} [label] — short name for secondary rows in the popover
 * @property {'full'|'limited'} [treeOwnership] — `limited` when this scope does not imply full edit rights for a larger tree
 */

/**
 * Register (or replace) document lock header targets. Pass **`{ registrations: [...] }`** for multiple
 * scopes (first enabled row is primary for the icon), or legacy **`collection` + `docID`** for one scope.
 * Idempotent when normalized registrations are unchanged.
 *
 * @param {HeaderDocumentLockUIRegistration & { registrations?: HeaderDocumentLockUIRegistration[] }} config
 * @returns {void}
 */
export function registerHeaderDocumentLockUI(config) {
  useUsersStore
    .getState()
    .headerDocumentLockUI.actions.registerHeaderDocumentLockUI(config);
}

/**
 * @param {Partial<HeaderDocumentLockUIRegistration>} partial
 * @returns {void}
 */
export function patchHeaderDocumentLockUI(partial) {
  useUsersStore
    .getState()
    .headerDocumentLockUI.actions.patchHeaderDocumentLockUI(partial);
}

/**
 * Remove app bar document lock context (e.g. on route unmount).
 * @returns {void}
 */
export function clearHeaderDocumentLockUI() {
  useUsersStore
    .getState()
    .headerDocumentLockUI.actions.clearHeaderDocumentLockUI();
}
