import useUsersStore from "../../Zustand/usersStore.js";
import { USER_JOBS_COLLECTION } from "./documentLockCollections.js";

/** Scope patch applied to each member job after this tab holds the group lock. */
export function groupMemberJobScopeAfterGroupGrantPartial() {
  return {
    lockHeld: false,
    readOnly: false,
    pendingAccessRequest: false,
    lockExpiresAtUnix: null,
    lockTtlSeconds: null,
  };
}

/**
 * Align every included job scope with group-holder editing (same neutral shape as
 * `document_lock_group_cascade` releases). Per-job locks are subordinate on the
 * group page; stale job-level `readOnly` must not block cards after acquire.
 *
 * @param {string} groupID
 */
export function patchGroupMemberJobScopesAfterGroupGrant(groupID) {
  if (!groupID) return;
  const group = useUsersStore.getState().jobData.actions.getGroupObject(groupID);
  if (!group?.includedJobIDs?.size) return;

  const partial = groupMemberJobScopeAfterGroupGrantPartial();
  const updates = [...group.includedJobIDs].map((jobID) => ({
    collection: USER_JOBS_COLLECTION,
    docID: jobID,
    partial,
  }));

  useUsersStore
    .getState()
    .documentLock.actions.patchManyDocumentLockScopes(updates);
}
