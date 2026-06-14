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
 * Matches {@link useActiveJobPersistGate} / group close semantics.
 *
 * @param {*} [state] — root store state; defaults to current snapshot
 * @param {string} collection
 * @param {string | undefined | null} docID
 * @returns {boolean}
 */
function canPersistDocumentScope(state, collection, docID) {
  if (!docID) return false;
  const s = state ?? useUsersStore.getState();
  const scope = selectScopedDocumentLock(s, collection, docID);
  return scope.lockHeld === true && scope.readOnly !== true;
}

/**
 * @param {string | undefined | null} groupID
 * @returns {boolean}
 */
export function canPersistGroupClose(groupID) {
  return canPersistDocumentScope(
    useUsersStore.getState(),
    USER_JOB_GROUPS_COLLECTION,
    groupID
  );
}

/**
 * Edit-job save/close: solo jobs need the job lock; group edit sessions need
 * only the group lock (group holder owns member jobs).
 *
 * @param {string | undefined | null} jobID
 * @param {string | undefined | null} groupID
 * @returns {boolean}
 */
export function canPersistJobClose(jobID, groupID) {
  const state = useUsersStore.getState();
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
