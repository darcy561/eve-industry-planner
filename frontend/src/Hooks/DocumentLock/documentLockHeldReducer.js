/**
 * Imperative “we hold the edit lock” mirror used for `/release` guards and
 * holder-only WS branches. Zustand `lockHeld` remains UI truth; this reducer
 * keeps transitions explicit (#16) while `heldRef` stays updated in the same
 * tick as each dispatch (see `useDocumentLockHeld`).
 */

export const DOCUMENT_LOCK_HELD_ACTIONS = Object.freeze({
  /** Align with `selectScopedDocumentLock(...).lockHeld` after any store patch. */
  SYNC_FROM_STORE: "document_lock_held_sync_from_store",
  /** Explicit set (acquire outcomes, `/release`, sync branches, WS cascade, etc.). */
  SET: "document_lock_held_set",
});

/**
 * @param {{ held: boolean }} state
 * @param {{
 *   type: string,
 *   lockHeld?: boolean,
 *   held?: boolean,
 * }} action
 */
export function documentLockHeldReducer(state, action) {
  switch (action.type) {
    case DOCUMENT_LOCK_HELD_ACTIONS.SYNC_FROM_STORE:
      return { held: Boolean(action.lockHeld) };
    case DOCUMENT_LOCK_HELD_ACTIONS.SET:
      return { held: Boolean(action.held) };
    default:
      return state;
  }
}
