import useUsersStore from "../../../Zustand/usersStore";
import {
  isJobInLiveGroup,
  selectDocumentLockReadOnly,
  selectScopedDocumentLock,
} from "../../../Functions/DocumentLock/documentLockSelectors";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "../../../Functions/DocumentLock/documentLockCollections";
import { persistAffordanceBlockedReason } from "../../DocumentLock/LockGatedTooltip";
import { canEditActiveJob } from "../../../Functions/DocumentLock/canPersistDocumentEditClose.js";
import { useJobDraft } from "./useJobDraft";

/**
 * Whether another session holds the open job's own lock.
 *
 * @returns {boolean}
 */
export function useActiveJobReadOnly() {
  const jobID = useJobDraft((job) => job.jobID);
  return useUsersStore((s) =>
    jobID ? selectDocumentLockReadOnly(s, USER_JOBS_COLLECTION, jobID) : false,
  );
}

/**
 * Whether another session holds the lock on the open job's group document; false for a job in no
 * live group.
 *
 * @returns {boolean}
 */
export function useActiveGroupReadOnly() {
  const groupID = useJobDraft((job) => job.groupID);
  const includedInGroup = useJobDraft((job) => job.includedInGroup);
  return useUsersStore((s) =>
    isJobInLiveGroup(s, groupID, includedInGroup)
      ? selectDocumentLockReadOnly(s, USER_JOB_GROUPS_COLLECTION, groupID)
      : false,
  );
}

/**
 * Whether this tab holds the open job's own lock.
 *
 * @returns {boolean}
 */
export function useActiveJobLockHeld() {
  const jobID = useJobDraft((job) => job.jobID);
  return useUsersStore((s) =>
    jobID
      ? selectScopedDocumentLock(s, USER_JOBS_COLLECTION, jobID).lockHeld ===
        true
      : false,
  );
}

/**
 * Whether the Edit Job page may save or change the open job, with the lock flags its tooltips
 * explain a refusal with.
 *
 * @returns {{canPersist: boolean, readOnly: boolean, jobLockHeld: boolean}}
 */
export function useActiveJobPersistGate() {
  const jobID = useJobDraft((job) => job.jobID);
  const readOnly = useActiveJobReadOnly();
  const jobLockHeld = useActiveJobLockHeld();
  const canPersist = useUsersStore((s) => canEditActiveJob(jobID, s));
  return { canPersist, readOnly, jobLockHeld };
}

/**
 * Whether the open job's links to its child jobs may change, and the reason to show when they may
 * not.
 *
 * @returns {{ readOnly: boolean, reason: string }}
 */
export function useSiblingLinkLock() {
  const gate = useActiveJobPersistGate();
  const blocked = !gate.canPersist;
  const reason = blocked
    ? persistAffordanceBlockedReason({
        readOnly: gate.readOnly,
        jobLockHeld: gate.jobLockHeld,
        action: "sibling-job links can't change",
      })
    : "";
  return { readOnly: blocked, reason };
}
