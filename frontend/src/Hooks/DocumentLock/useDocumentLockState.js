import useUsersStore from "../../Zustand/usersStore";
import { selectDocumentLockReadOnly } from "../../Functions/DocumentLock/documentLockSelectors";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../../Functions/DocumentLock/documentLockCollections";
import { canEditActiveGroup } from "../../Functions/DocumentLock/canPersistDocumentEditClose.js";
import { lockReasonText } from "../../Components/DocumentLock/LockGatedTooltip";

/**
 * Whether the per-job document lock for `jobID` is held by another session.
 *
 * @param {string | undefined | null} jobID
 * @returns {boolean}
 */
export function useJobLockReadOnly(jobID) {
  return useUsersStore((s) =>
    jobID ? selectDocumentLockReadOnly(s, USER_JOBS_COLLECTION, jobID) : false,
  );
}

/**
 * Whether the group document lock for `groupID` is held by another session.
 *
 * @param {string | undefined | null} groupID
 * @returns {boolean}
 */
export function useGroupLockReadOnly(groupID) {
  return useUsersStore((s) =>
    groupID
      ? selectDocumentLockReadOnly(s, USER_JOB_GROUPS_COLLECTION, groupID)
      : false,
  );
}

/**
 * Whether the currently active group's document lock is held by another session.
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
 * Group-page mutate eligibility — {@link canEditActiveGroup} (guest local edits or logged-in
 * holder).
 *
 * @param {string | undefined | null} groupID
 * @returns {boolean}
 */
export function useGroupCanEdit(groupID) {
  return useUsersStore((s) => canEditActiveGroup(groupID, s));
}

/**
 * {@link useGroupCanEdit} for `jobData.activeGroupID` (group name frame, etc.).
 *
 * @returns {boolean}
 */
export function useActiveGroupCanEdit() {
  return useUsersStore((s) => canEditActiveGroup(s.jobData.activeGroupID, s));
}

/**
 * Whether a job card is locked, because another session holds the job or the group it sits in, and
 * the reason to show.
 *
 * @param {object} params
 * @param {string | undefined | null} params.jobID
 * @param {boolean} [params.groupReadOnly=false]
 * @returns {{cardLocked: boolean, jobReadOnly: boolean, groupReadOnly: boolean, reason: string}}
 */
export function useJobCardLockState({ jobID, groupReadOnly = false } = {}) {
  const jobReadOnly = useJobLockReadOnly(jobID);
  const cardLocked = jobReadOnly || groupReadOnly;
  const reason = cardLocked
    ? lockReasonText({
        scope: groupReadOnly ? "group" : "job",
        action: "opens in read-only view",
      })
    : "";
  return { cardLocked, jobReadOnly, groupReadOnly, reason };
}
