import useUsersStore from "../../Zustand/usersStore";
import { selectDocumentLockReadOnly } from "../../Functions/DocumentLock/documentLockSelectors";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../../Functions/DocumentLock/documentLockCollections";
import { lockReasonText } from "../../Components/DocumentLock/LockGatedTooltip";

/**
 * ID-shaped read-only lock hooks for the planner / group surfaces.
 *
 * The Edit-Job page already has analogous hooks in
 * `Components/Edit Job/Edit Job Hooks/useActiveJobDocumentLock.js`, but those
 * read `state.activeJob?.jobID` / `state.activeJob?.groupID` from the
 * edit-job reducer. The planner job cards, group cards, group page wrapper,
 * search bar, group-name frame and DnD machinery all work from raw IDs
 * (`job.jobID`, `group.groupID`, `state.jobData.activeGroupID`), so these
 * hooks take the ID directly and route through the same
 * `selectDocumentLockReadOnly` selector the rest of the unified system uses.
 *
 * Centralising the subscription shape here removes the
 * `useUsersStore((s) => …selectDocumentLockReadOnly…)` boilerplate that was
 * duplicated across ~9 components.
 */

/**
 * Whether the per-job document lock for `jobID` is held by another session.
 * Returns `false` (no subscription change) when `jobID` is falsy so callers
 * can use it unconditionally on cards that may not have a job yet.
 *
 * @param {string | undefined | null} jobID
 * @returns {boolean}
 */
export function useJobLockReadOnly(jobID) {
  return useUsersStore((s) =>
    jobID ? selectDocumentLockReadOnly(s, USER_JOBS_COLLECTION, jobID) : false
  );
}

/**
 * Whether the group document lock for `groupID` is held by another session.
 * Returns `false` when `groupID` is falsy so callers can use it
 * unconditionally for solo jobs / planner-only contexts.
 *
 * @param {string | undefined | null} groupID
 * @returns {boolean}
 */
export function useGroupLockReadOnly(groupID) {
  return useUsersStore((s) =>
    groupID
      ? selectDocumentLockReadOnly(s, USER_JOB_GROUPS_COLLECTION, groupID)
      : false
  );
}

/**
 * Whether the currently active group's document lock is held by another
 * session. Convenience for surfaces that read from
 * `state.jobData.activeGroupID` rather than carrying the id around as a prop
 * (search bar's "create new job into the active group", group-name editor).
 *
 * @returns {boolean}
 */
export function useActiveGroupLockReadOnly() {
  return useUsersStore((s) => {
    const gid = s.jobData.activeGroupID;
    if (!gid) return false;
    return selectDocumentLockReadOnly(s, USER_JOB_GROUPS_COLLECTION, gid);
  });
}

/**
 * Combined gate for a job card. `cardLocked` is the canonical "card opens in
 * read-only view" flag every job/group-job card frame uses.
 *
 * `groupReadOnly` is taken as a prop rather than re-derived from `job.groupID`
 * because:
 *  - Planner-page job cards intentionally do NOT honour the group lock
 *    cascade (a locked group doesn't gate planner-page browsing of its
 *    member jobs from outside the group page).
 *  - Group-page card frames already receive `groupReadOnly` as a prop from
 *    the page-level subscription (`groupFrame.jsx`) so the cascade decision
 *    stays in one place.
 *
 * Group-lock cause takes precedence in the returned `reason` because the
 * group lock is the more-restrictive cascade — naming it leads the user to
 * the place where they can reclaim editing rights.
 *
 * @param {Object} params
 * @param {string | undefined | null} params.jobID
 * @param {boolean} [params.groupReadOnly=false]
 * @param {boolean} [params.jobLockSubordinateToGroup=false] — group page: group lock owns member jobs
 * @returns {{
 *   cardLocked: boolean,
 *   jobReadOnly: boolean,
 *   groupReadOnly: boolean,
 *   reason: string,
 * }}
 */
export function useJobCardLockState({
  jobID,
  groupReadOnly = false,
  jobLockSubordinateToGroup = false,
} = {}) {
  const jobReadOnly = useJobLockReadOnly(jobID);
  const cardLocked = jobLockSubordinateToGroup
    ? groupReadOnly
    : jobReadOnly || groupReadOnly;
  let reason = "";
  if (cardLocked) {
    reason = lockReasonText({
      scope: groupReadOnly || jobLockSubordinateToGroup ? "group" : "job",
      action: "opens in read-only view",
    });
  }
  return { cardLocked, jobReadOnly, groupReadOnly, reason };
}
