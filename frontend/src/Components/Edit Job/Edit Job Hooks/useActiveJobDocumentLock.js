import useUsersStore from "../../../Zustand/usersStore";
import {
  selectDocumentLockReadOnly,
  selectScopedDocumentLock,
} from "../../../Functions/DocumentLock/documentLockSelectors";
import {
  isJobInLiveGroup,
  isJobLockSubordinateToGroup,
  selectEffectiveJobDocumentLock,
} from "../../../Functions/DocumentLock/groupSubordinateJobLock.js";
import { USER_JOB_GROUPS_COLLECTION } from "../../../Functions/DocumentLock/documentLockCollections";
import { persistAffordanceBlockedReason } from "../../DocumentLock/LockGatedTooltip";
import { canEditActiveJob } from "../../../Functions/DocumentLock/canPersistDocumentEditClose.js";
import { useJobDraft } from "./useJobDraft";

/**
 * Edit-job page hooks that surface the per-job and group document-lock state in
 * the shape every disable/tooltip site needs. Centralising these here keeps the
 * jobID / groupID boilerplate (plus the collection constant noise) out of every
 * leaf component.
 *
 * Each reads the open job and the lock state from the store, so a call site
 * needs nothing but the answer, and updates as soon as the lock moves — handoff,
 * expiry, a server-side cascade.
 */

/** The open job's identity, which is all the locks are asked about. */
function useLockedJob() {
  return {
    jobID: useJobDraft((job) => job.jobID),
    groupID: useJobDraft((job) => job.groupID),
    includedInGroup: useJobDraft((job) => job.includedInGroup),
  };
}

/**
 * Whether the active job's per-job document lock is held by another session.
 * Returns `false` when no active job is loaded yet (during fetch).
 *
 * @returns {boolean}
 */
export function useActiveJobReadOnly() {
  const { jobID, groupID } = useLockedJob();
  return useUsersStore((s) => {
    if (!jobID) return false;
    return selectEffectiveJobDocumentLock(s, jobID, groupID).readOnly === true;
  });
}

/**
 * Whether the active job's group lock is held by another session. Returns
 * `false` for solo jobs (no `groupID`) so callers can use it unconditionally.
 *
 * @returns {boolean}
 */
export function useActiveGroupReadOnly() {
  const { groupID: gid, includedInGroup } = useLockedJob();
  return useUsersStore((s) => {
    if (!gid || !includedInGroup) return false;
    if (!s.jobData.actions.getGroupObject(gid)) return false;
    return selectDocumentLockReadOnly(s, USER_JOB_GROUPS_COLLECTION, gid);
  });
}

/**
 * Composite gate for affordances that mutate either the active job or a sibling
 * inside its group (so they have to honour both locks). Returns the merged
 * `readOnly` flag plus the individual flags so callers can compose tailored
 * tooltip copy without duplicating the selector chain.
 *
 * Group-lock cause is reported first when both locks are read-only: the group
 * lock is the more-restrictive cascade, and naming it leads users to the right
 * place to reclaim editing rights.
 *
 * @returns {{
 *   readOnly: boolean,
 *   jobReadOnly: boolean,
 *   groupReadOnly: boolean,
 * }}
 */
export function useActiveJobOrGroupReadOnly() {
  const { groupID } = useLockedJob();
  const jobReadOnly = useActiveJobReadOnly();
  const groupReadOnly = useActiveGroupReadOnly();
  const subordinate = useUsersStore((s) =>
    isJobLockSubordinateToGroup(s, groupID),
  );
  return {
    readOnly: subordinate ? groupReadOnly : jobReadOnly || groupReadOnly,
    jobReadOnly: subordinate ? false : jobReadOnly,
    groupReadOnly,
  };
}

/**
 * Whether this tab holds the per-job edit lock for the active job.
 *
 * @returns {boolean}
 */
export function useActiveJobLockHeld() {
  const { jobID, groupID } = useLockedJob();
  return useUsersStore((s) => {
    if (!jobID) return false;
    return selectEffectiveJobDocumentLock(s, jobID, groupID).lockHeld === true;
  });
}

/**
 * Whether this tab holds the group edit lock (solo jobs report `true`).
 *
 * @returns {boolean}
 */
export function useActiveGroupLockHeld() {
  const { groupID: gid, includedInGroup: included } = useLockedJob();
  return useUsersStore((s) => {
    if (!gid || !included) return true;
    if (!s.jobData.actions.getGroupObject(gid)) return true;
    return selectScopedDocumentLock(s, USER_JOB_GROUPS_COLLECTION, gid)
      .lockHeld;
  });
}

/**
 * Persist / mutate gate for edit-job save, delete, leave-dialogue save, and
 * sibling-link affordances. `canPersist` is {@link canEditActiveJob} (guest
 * bypass + {@link canPersistJobClose} when logged in). Lock flags are still
 * returned for tooltip copy.
 *
 * @returns {{
 *   canPersist: boolean,
 *   readOnly: boolean,
 *   jobReadOnly: boolean,
 *   groupReadOnly: boolean,
 *   jobLockHeld: boolean,
 *   groupLockHeld: boolean,
 *   hasGroup: boolean,
 * }}
 */
export function useActiveJobPersistGate() {
  const { readOnly, jobReadOnly, groupReadOnly } =
    useActiveJobOrGroupReadOnly();
  const jobLockHeld = useActiveJobLockHeld();
  const groupLockHeld = useActiveGroupLockHeld();
  const held = useLockedJob();
  const jobID = held.jobID;
  const groupID = held.includedInGroup ? held.groupID : null;
  const hasGroup = useUsersStore((s) => isJobInLiveGroup(s, groupID));
  const canPersist = useUsersStore((s) => canEditActiveJob(jobID, groupID, s));

  return {
    canPersist,
    readOnly,
    jobReadOnly,
    groupReadOnly,
    jobLockHeld,
    groupLockHeld,
    hasGroup,
  };
}

/**
 * Gate + tooltip-ready reason for affordances that mutate child/sibling links
 * (link-to-existing-group-job, unlink, purchasing step's available/linked rows,
 * etc.). All of these touch a sibling under the same group lock cascade, so the
 * reason copy is shared across the call sites — re-use this hook instead of
 * inlining the if/else ladder.
 *
 * @returns {{ readOnly: boolean, reason: string }}
 */
export function useSiblingLinkLock() {
  const gate = useActiveJobPersistGate();
  const blocked = !gate.canPersist;
  const reason = blocked
    ? persistAffordanceBlockedReason({
        readOnly: gate.readOnly,
        jobReadOnly: gate.jobReadOnly,
        groupReadOnly: gate.groupReadOnly,
        jobLockHeld: gate.jobLockHeld,
        groupLockHeld: gate.groupLockHeld,
        hasGroup: gate.hasGroup,
        action: "sibling-job links can't change",
      })
    : "";
  return { readOnly: blocked, reason };
}
