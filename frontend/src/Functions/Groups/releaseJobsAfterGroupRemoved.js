import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import { requestJobDocumentsByIdsFromApi } from "../Endpoints/Private/requestJobDocumentsByIds.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Collects the job ids a removed group held.
 *
 * Both the group's own `includedJobIDs` and any job in the store still carrying
 * the group id: an empty or out-of-sync group document, and a group object
 * already gone locally, each leave one of the two empty.
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
 * Returns this client's copies of a removed group's jobs to normal planner
 * state, writing nothing.
 *
 * For a removal this client did not make. The client that deleted the group
 * releases and saves the jobs, and those writes arrive here as job-document
 * deliveries — so fetching or saving here would repeat the author's work once
 * per connected member, each from its own snapshot.
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
    foundJob.releaseFromGroupToPlanner();
    released.push(foundJob);
  }
  if (released.length > 0) actions.updateOrAddJobsToJobArray(released);
  return released;
}

/**
 * Releases a removed group's jobs and writes them, for the client removing it.
 *
 * Loads any of the group's jobs this client does not hold before releasing them:
 * the client that deletes the group is the one persisting the release, so a
 * member it never opened would otherwise keep a group id pointing at nothing.
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
      const fetched = await requestJobDocumentsByIdsFromApi(missing);
      actions.updateOrAddJobsToJobArray(fetched);
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
