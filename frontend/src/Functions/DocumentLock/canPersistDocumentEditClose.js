import { selectScopedDocumentLock } from "./documentLockSelectors.js";
import {
  isJobInLiveGroup,
  isJobLockSubordinateToGroup,
} from "./groupSubordinateJobLock.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "./documentLockCollections.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Whether this tab may PUT a scoped document (holder + not read-only).
 *
 * @param {*} state — root store state
 * @param {string} collection
 * @param {string | undefined | null} docID
 * @returns {boolean}
 */
function canPersistDocumentScope(state, collection, docID) {
  if (!docID) return false;
  const scope = selectScopedDocumentLock(state, collection, docID);
  return scope.lockHeld === true && scope.readOnly !== true;
}

/**
 * UI mutate gate shared by edit-job and group pages.
 * Logged-out: local-only edits — no Redis lease. Logged-in: same holder check
 * used for API persist (`canPersistJobClose` / `canPersistGroupClose`).
 *
 * @param {boolean} hasDocument
 * @param {*} state
 * @param {boolean} holderEligible
 * @returns {boolean}
 */
function canEditLocallyOrAsHolder(hasDocument, state, holderEligible) {
  if (!hasDocument) return false;
  if (!state.account?.isLoggedIn) return true;
  return holderEligible;
}

/**
 * @param {string | undefined | null} groupID
 * @param {*} [state] — root store state; defaults to current snapshot
 * @returns {boolean}
 */
export function canPersistGroupClose(groupID, state = useUsersStore.getState()) {
  return canPersistDocumentScope(
    state,
    USER_JOB_GROUPS_COLLECTION,
    groupID
  );
}

/**
 * Server persist eligibility for edit-job save/close: solo jobs need the job
 * lock; group edit sessions need only the group lock (group holder owns member
 * jobs). Callers that hit the API should still gate with `isLoggedIn`.
 *
 * @param {string | undefined | null} jobID
 * @param {string | undefined | null} groupID
 * @param {*} [state] — root store state; defaults to current snapshot
 * @returns {boolean}
 */
export function canPersistJobClose(jobID, groupID, state = useUsersStore.getState()) {
  if (!jobID) return false;
  if (isJobLockSubordinateToGroup(state, groupID)) {
    return canPersistDocumentScope(state, USER_JOB_GROUPS_COLLECTION, groupID);
  }
  if (!canPersistDocumentScope(state, USER_JOBS_COLLECTION, jobID)) {
    return false;
  }
  if (!isJobInLiveGroup(state, groupID)) return true;
  return canPersistDocumentScope(state, USER_JOB_GROUPS_COLLECTION, groupID);
}

/**
 * Edit-job UI mutate gate (save / delete / sibling links / leave-save).
 *
 * @param {string | undefined | null} jobID
 * @param {string | undefined | null} groupID — pass null when not `includedInGroup`
 * @param {*} [state] — root store state; defaults to current snapshot
 * @returns {boolean}
 */
export function canEditActiveJob(jobID, groupID, state = useUsersStore.getState()) {
  return canEditLocallyOrAsHolder(
    Boolean(jobID),
    state,
    canPersistJobClose(jobID, groupID, state)
  );
}

/**
 * Group-page UI mutate gate (side-menu mutations, rename, etc.).
 * Pair of {@link canEditActiveJob}; holder rules from {@link canPersistGroupClose}.
 *
 * @param {string | undefined | null} groupID
 * @param {*} [state] — root store state; defaults to current snapshot
 * @returns {boolean}
 */
export function canEditActiveGroup(groupID, state = useUsersStore.getState()) {
  return canEditLocallyOrAsHolder(
    Boolean(groupID),
    state,
    canPersistGroupClose(groupID, state)
  );
}
