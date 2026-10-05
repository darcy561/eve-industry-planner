import useUsersStore from "../../Zustand/usersStore.js";
import { USER_JOBS_COLLECTION } from "./documentLockCollections.js";

/**
 * Releases the open job's own lock on leaving the Edit Job page, or hands it to whoever asked for it;
 * a group's lock is left for Close Group.
 *
 * @param {{ jobID?: string | null }} params
 */
export async function yieldEditJobDocumentLocksOnLeave({ jobID }) {
  if (!jobID) return;
  await useUsersStore
    .getState()
    .documentLock.actions.yieldDocumentLockOnLeave(USER_JOBS_COLLECTION, jobID);
}
