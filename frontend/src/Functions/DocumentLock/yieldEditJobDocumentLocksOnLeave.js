import useUsersStore from "../../Zustand/usersStore.js";
import { USER_JOBS_COLLECTION } from "./documentLockCollections.js";

/**
 * Release (or hand over) the **solo** per-job lock before leaving edit job.
 *
 * When `groupID` is set, the tab is in a group editing session: the group
 * lease and per-job leases stay until **Close Group** or an accepted handoff —
 * do not call this helper (and use `releaseOnUnmount: false` on
 * `useDocumentLock` for those scopes).
 *
 * @param {{ jobID?: string | null, groupID?: string | null }} params
 */
export async function yieldEditJobDocumentLocksOnLeave({ jobID, groupID }) {
  if (groupID) return;
  if (!jobID) return;
  await useUsersStore
    .getState()
    .documentLock.actions.yieldDocumentLockOnLeave(USER_JOBS_COLLECTION, jobID);
}
