import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import { requestJobDocumentsByIdsFromApi } from "../Endpoints/Private/requestJobDocumentsByIds.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Returns jobs from a removed group to normal planner state (mirrors local-only delete cleanup).
 * Uses the group's `includedJobIDs` when present, and also any jobs in the store with matching
 * `groupID` (covers empty/out-of-sync group docs and races where the group object is already gone).
 * When signed in, loads any of those job IDs that are not yet in `jobArray` from the private API
 * before mutating, so unopened group members are still released onto the planner.
 *
 * @param {{ groupID?: string; includedJobIDs?: Iterable<string> } | null} groupLike
 */
export async function releaseJobsAfterGroupRemoved(groupLike) {
  if (!groupLike) return;

  const groupID =
    groupLike.groupID != null && String(groupLike.groupID).trim() !== ""
      ? String(groupLike.groupID)
      : null;
  const { jobData, jobData: { actions } } = useUsersStore.getState();
  const fromDoc = groupLike.includedJobIDs
    ? [...groupLike.includedJobIDs]
    : [];
  const fromJobs = groupID
    ? jobData.jobArray
        .filter((j) => j.groupID === groupID)
        .map((j) => j.jobID)
    : [];
  const idSet = new Set([...fromDoc, ...fromJobs]);
  if (idSet.size === 0) return;

  const idList = [...idSet];
  const missing = idList.filter((id) => !actions.findJobInJobArray(id));
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  if (missing.length > 0 && isLoggedIn) {
    try {
      const fetched = await requestJobDocumentsByIdsFromApi(missing);
      actions.updateOrAddJobsToJobArray(fetched);
    } catch (err) {
      console.error("releaseJobsAfterGroupRemoved: could not load job documents", err);
    }
  }

  const batchJobs = [];

  for (const jobID of idSet) {
    const foundJob = actions.findJobInJobArray(jobID);
    if (!foundJob) continue;
    foundJob.releaseFromGroupToPlanner();
    batchJobs.push(foundJob);
  }
  if (batchJobs.length === 0) return;

  actions.updateOrAddJobsToJobArray(batchJobs);

  if (isLoggedIn) {
    await saveJobsViaApi(batchJobs);
  }
}
