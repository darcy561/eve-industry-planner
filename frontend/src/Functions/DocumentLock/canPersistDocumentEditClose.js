import { selectScopedDocumentLock } from "./documentLockSelectors.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "./documentLockCollections.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Whether this tab holds a document's lock and is not read-only on it.
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
 * Whether the reader may change a document here: always when signed out, since nothing is saved,
 * and otherwise only as its holder.
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
 * Whether this tab may save a group's own document.
 *
 * @param {string | undefined | null} groupID
 * @param {*} [state] — root store state; defaults to current snapshot
 * @returns {boolean}
 */
export function canPersistGroupClose(
  groupID,
  state = useUsersStore.getState(),
) {
  return canPersistDocumentScope(state, USER_JOB_GROUPS_COLLECTION, groupID);
}

/**
 * Whether this tab may save a job: it holds that job's own lock, whatever group the job is in.
 *
 * @param {string | undefined | null} jobID
 * @param {*} [state] — root store state; defaults to current snapshot
 * @returns {boolean}
 */
export function canPersistJobClose(jobID, state = useUsersStore.getState()) {
  if (!jobID) return false;
  return canPersistDocumentScope(state, USER_JOBS_COLLECTION, jobID);
}

/**
 * Whether the Edit Job page may change the open job.
 *
 * @param {string | undefined | null} jobID
 * @param {*} [state] — root store state; defaults to current snapshot
 * @returns {boolean}
 */
export function canEditActiveJob(jobID, state = useUsersStore.getState()) {
  return canEditLocallyOrAsHolder(
    Boolean(jobID),
    state,
    canPersistJobClose(jobID, state),
  );
}

/**
 * Whether the group page may change the group's own document.
 *
 * @param {string | undefined | null} groupID
 * @param {*} [state] — root store state; defaults to current snapshot
 * @returns {boolean}
 */
export function canEditActiveGroup(groupID, state = useUsersStore.getState()) {
  return canEditLocallyOrAsHolder(
    Boolean(groupID),
    state,
    canPersistGroupClose(groupID, state),
  );
}
