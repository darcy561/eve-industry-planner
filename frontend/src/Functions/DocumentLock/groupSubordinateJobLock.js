import { selectScopedDocumentLock } from "./documentLockSelectors.js";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "./documentLockCollections.js";

/**
 * Group edit sessions (group page or edit-job with matching `activeGroupID`)
 * treat the group lock as authoritative for every included job — per-job Redis
 * rows are subordinate and cleared on group grant / cascade.
 *
 * @param {*} state — root store state
 * @param {string | undefined | null} groupID — job's parent group
 * @returns {boolean}
 */
export function isJobLockSubordinateToGroup(state, groupID) {
  if (!groupID) return false;
  const activeGroupID = state?.jobData?.activeGroupID;
  return Boolean(activeGroupID && activeGroupID === groupID);
}

/**
 * Effective lock scope for a job: group scope when subordinate, else per-job scope.
 *
 * @param {*} state
 * @param {string | undefined | null} jobID
 * @param {string | undefined | null} groupID
 */
export function selectEffectiveJobDocumentLock(state, jobID, groupID) {
  if (isJobLockSubordinateToGroup(state, groupID)) {
    return selectScopedDocumentLock(
      state,
      USER_JOB_GROUPS_COLLECTION,
      groupID
    );
  }
  if (!jobID) {
    return selectScopedDocumentLock(state, USER_JOBS_COLLECTION, "");
  }
  return selectScopedDocumentLock(state, USER_JOBS_COLLECTION, jobID);
}
