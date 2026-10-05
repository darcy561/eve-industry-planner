import {
  applyCommands,
  releaseFromGroupToPlanner,
} from "../../Components/Edit Job/Edit Job Hooks/jobCommands";
import { saveJobsViaApi } from "../Job/sync/saveJobsViaApi.js";
import { readJobsIntoPlanner } from "../Job/sync/persistJobDocumentsToApi.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Collects the job ids a removed group held, from its own `includedJobIDs` and
 * from any job in the store still carrying the group id.
 *
 * @param {{ groupID?: string; includedJobIDs?: Iterable<string> } | null} groupLike
 * @returns {string[]}
 */
function jobIDsOfRemovedGroup(groupLike) {
  const groupID =
    groupLike?.groupID != null && String(groupLike.groupID).trim() !== ""
      ? String(groupLike.groupID)
      : null;
  const { jobArray } = useUsersStore.getState().jobData;
  const fromDoc = groupLike?.includedJobIDs
    ? [...groupLike.includedJobIDs]
    : [];
  const fromJobs = groupID
    ? jobArray.filter((job) => job.groupID === groupID).map((job) => job.jobID)
    : [];
  return [...new Set([...fromDoc, ...fromJobs])];
}

/**
 * Returns this client's copies of a removed group's jobs to normal planner state,
 * writing nothing, for a removal another member made.
 *
 * @param {{ groupID?: string; includedJobIDs?: Iterable<string> } | null} groupLike
 * @returns {object[]} the jobs this client changed
 */
export function applyGroupRemovalToJobs(groupLike) {
  if (!groupLike) return [];
  const { actions } = useUsersStore.getState().jobData;

  const released = [];
  for (const jobID of jobIDsOfRemovedGroup(groupLike)) {
    const foundJob = actions.findJobInJobArray(jobID);
    if (!foundJob) continue;
    applyCommands(foundJob, releaseFromGroupToPlanner());
    released.push(foundJob);
  }
  if (released.length > 0) actions.updateOrAddJobsToJobArray(released);
  return released;
}

/**
 * Releases a removed group's jobs and writes them, loading any the removing
 * client does not already hold.
 *
 * @param {{ groupID?: string; includedJobIDs?: Iterable<string> } | null} groupLike
 * @returns {Promise<void>}
 */
export async function releaseJobsAfterGroupRemoved(groupLike) {
  if (!groupLike) return;
  const { actions } = useUsersStore.getState().jobData;
  const idList = jobIDsOfRemovedGroup(groupLike);
  if (idList.length === 0) return;

  const missing = idList.filter((id) => !actions.findJobInJobArray(id));
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  if (missing.length > 0 && isLoggedIn) {
    try {
      await readJobsIntoPlanner(missing);
    } catch (err) {
      console.error(
        "releaseJobsAfterGroupRemoved: could not load job documents",
        err,
      );
    }
  }

  const released = applyGroupRemovalToJobs(groupLike);
  if (released.length === 0) return;

  if (isLoggedIn) {
    await saveJobsViaApi(released);
  }
}
