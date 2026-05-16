import { useCallback } from "react";
import useUsersStore from "../../../Zustand/usersStore";
import {
  selectDocumentLockReadOnly,
  selectScopedDocumentLock,
} from "../../../Functions/DocumentLock/documentLockSelectors";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../../../Functions/DocumentLock/documentLockCollections";
import { persistAffordanceBlockedReason } from "../../DocumentLock/LockGatedTooltip";

/**
 * Edit-job page hooks that surface the per-job and group document-lock state in
 * the shape every disable/tooltip site needs. Centralising these here keeps the
 * `state.activeJob?.jobID` / `state.activeJob?.groupID` boilerplate (plus the
 * collection constant noise) out of every leaf component.
 *
 * All hooks expect the standard `state` returned by {@link useEditJobReducer};
 * they read from the Zustand store reactively, so call sites update as soon as
 * the lock state changes (handoff, expiry, server-side cascade, etc.).
 */

/**
 * Whether the active job's per-job document lock is held by another session.
 * Returns `false` when no active job is loaded yet (during fetch).
 *
 * @param {{ activeJob?: { jobID?: string } } | undefined} state
 * @returns {boolean}
 */
export function useActiveJobReadOnly(state) {
  return useUsersStore((s) =>
    state?.activeJob?.jobID
      ? selectDocumentLockReadOnly(s, USER_JOBS_COLLECTION, state.activeJob.jobID)
      : false
  );
}

/**
 * Whether the active job's group lock is held by another session. Returns
 * `false` for solo jobs (no `groupID`) so callers can use it unconditionally.
 *
 * @param {{ activeJob?: { groupID?: string } } | undefined} state
 * @returns {boolean}
 */
export function useActiveGroupReadOnly(state) {
  return useUsersStore((s) =>
    state?.activeJob?.groupID
      ? selectDocumentLockReadOnly(
          s,
          USER_JOB_GROUPS_COLLECTION,
          state.activeJob.groupID
        )
      : false
  );
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
 * @param {{ activeJob?: { jobID?: string, groupID?: string } } | undefined} state
 * @returns {{
 *   readOnly: boolean,
 *   jobReadOnly: boolean,
 *   groupReadOnly: boolean,
 * }}
 */
export function useActiveJobOrGroupReadOnly(state) {
  const jobReadOnly = useActiveJobReadOnly(state);
  const groupReadOnly = useActiveGroupReadOnly(state);
  return {
    readOnly: jobReadOnly || groupReadOnly,
    jobReadOnly,
    groupReadOnly,
  };
}

/**
 * Whether this tab holds the per-job edit lock for the active job.
 *
 * @param {{ activeJob?: { jobID?: string } } | undefined} state
 * @returns {boolean}
 */
export function useActiveJobLockHeld(state) {
  return useUsersStore((s) =>
    state?.activeJob?.jobID
      ? selectScopedDocumentLock(s, USER_JOBS_COLLECTION, state.activeJob.jobID)
          .lockHeld
      : false
  );
}

/**
 * Whether this tab holds the group edit lock (solo jobs report `true`).
 *
 * @param {{ activeJob?: { groupID?: string } } | undefined} state
 * @returns {boolean}
 */
export function useActiveGroupLockHeld(state) {
  return useUsersStore((s) => {
    const gid = state?.activeJob?.groupID;
    if (!gid) return true;
    return selectScopedDocumentLock(s, USER_JOB_GROUPS_COLLECTION, gid).lockHeld;
  });
}

/**
 * Server-backed persist (job + optional group) requires holding each relevant
 * lease, not merely `!readOnly` (#21 vacancy window).
 *
 * @param {{ activeJob?: { jobID?: string, groupID?: string } } | undefined} state
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
export function useActiveJobPersistGate(state) {
  const { readOnly, jobReadOnly, groupReadOnly } = useActiveJobOrGroupReadOnly(state);
  const jobLockHeld = useActiveJobLockHeld(state);
  const groupLockHeld = useActiveGroupLockHeld(state);
  const hasGroup = Boolean(state?.activeJob?.groupID);
  const jobID = state?.activeJob?.jobID;

  const canPersist =
    Boolean(jobID) && !readOnly && jobLockHeld && (!hasGroup || groupLockHeld);

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
 * @param {{ activeJob?: { jobID?: string, groupID?: string } } | undefined} state
 * @returns {{ readOnly: boolean, reason: string }}
 */
export function useSiblingLinkLock(state) {
  const gate = useActiveJobPersistGate(state);
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

/**
 * Wrap an event handler so it becomes a no-op while the doc is not persistable.
 *
 * - `readOnly` — another session / viewer (unchanged UX).
 * - `lockHeld` — when a boolean is passed (#21), also block while this tab is
 *   not the holder (vacant-editable gap). Omit or pass `undefined` to gate on
 *   `readOnly` only.
 *
 * @template {(...args: any[]) => any} F
 * @param {F} handler
 * @param {boolean} readOnly
 * @param {boolean} [lockHeld]
 * @returns {F}
 */
export function useLockGatedHandler(handler, readOnly, lockHeld) {
  const blocked =
    readOnly || (typeof lockHeld === "boolean" && !lockHeld);
  return useCallback(
    /** @type {F} */ ((...args) => {
      if (blocked) return undefined;
      return handler(...args);
    }),
    [handler, blocked]
  );
}
