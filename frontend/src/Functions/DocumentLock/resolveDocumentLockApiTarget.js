import useUsersStore from "../../Zustand/usersStore.js";
import { isJobInLiveGroup } from "./groupSubordinateJobLock.js";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "./documentLockCollections.js";

/**
 * Group jobs share one edit session: mutating APIs target the group lock so
 * handover / request / force-release cascade per-job on the server.
 *
 * @param {string} collection
 * @param {string} docID
 * @returns {{ collection: string, docID: string }}
 */
export function resolveDocumentLockApiTarget(collection, docID) {
  if (!collection || !docID) {
    return { collection: collection ?? "", docID: docID ?? "" };
  }
  if (collection !== USER_JOBS_COLLECTION) {
    return { collection, docID };
  }
  const state = useUsersStore.getState();
  const job = state.jobData.actions.findJobInJobArray(docID);
  if (
    !job?.includedInGroup ||
    !job.groupID ||
    !isJobInLiveGroup(state, job.groupID, job.includedInGroup)
  ) {
    return { collection, docID };
  }
  return {
    collection: USER_JOB_GROUPS_COLLECTION,
    docID: job.groupID,
  };
}
