import useUsersStore from "../../Zustand/usersStore.js";
import { selectScopedDocumentLock } from "./documentLockSelectors.js";

/**
 * Helpers shared between the two read-only grace timers — the per-hook
 * `useDocumentLock` timer (one per mounted lock scope) and the module-level
 * planner-only timer in `applyDocumentLockStatusFromPayload`.
 *
 * The two timers stay separate intentionally (different lifecycles: hook
 * cleanup vs. arbitrary HTTP batches) but they always share:
 *   - the same grace window (`LOCK_READONLY_GRACE_MS`)
 *   - the same predicate for "should we still drop readOnly?"
 *   - the same patch shape (`{ readOnly: false }`)
 *
 * Centralising those three pieces here prevents subtle drift; only the
 * timer-storage strategy is duplicated.
 */

/**
 * Returns true iff the scope is still in the "lock vanished, nobody picked it
 * up" pattern that originally armed the grace timer. The receiver decides
 * what to do — usually patch `readOnly: false`.
 *
 * Race-safe: any `acquired` / `handoff_completed` that arrived during the
 * grace will have set `lockExpiresAtUnix` (or flipped `lockHeld`) by the time
 * this runs, so the timer leaves the now-confirmed state alone.
 *
 * @param {{ readOnly: boolean, lockHeld: boolean, lockExpiresAtUnix: number | null }} scope
 */
export function shouldEndReadOnlyGrace(scope) {
  if (!scope) return false;
  if (scope.waitingInHandoffQueue) return false;
  return (
    scope.readOnly === true &&
    scope.lockHeld === false &&
    scope.lockExpiresAtUnix == null
  );
}

/**
 * Patches `readOnly: false` into the scope iff the grace predicate still
 * applies. Used as the body of both grace timers so the predicate and the
 * patch always travel together.
 *
 * @param {string} collection
 * @param {string} docID
 * @returns {boolean} whether the patch was applied
 */
export function endReadOnlyGraceIfApplicable(collection, docID) {
  if (!collection || !docID) return false;
  const cur = selectScopedDocumentLock(
    useUsersStore.getState(),
    collection,
    docID
  );
  if (!shouldEndReadOnlyGrace(cur)) return false;
  useUsersStore
    .getState()
    .documentLock.actions.patchDocumentLockForScope(collection, docID, {
      readOnly: false,
    });
  return true;
}
