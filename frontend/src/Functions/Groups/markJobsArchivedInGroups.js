import useUsersStore from "../../Zustand/usersStore.js";
import { putJobGroupsBatch } from "../Endpoints/Private/groups.js";
import { workingGroups } from "../Job/changes/workingCopies.js";
import { showSnackbarWarning } from "../../Events/snackbarEvents.js";

/**
 * Records archived jobs against the groups they belong to, which keep them as members marked as held
 * in the archive.
 *
 * @param {Array<Object>} archivedJobs - Jobs that have just been archived
 * @returns {Promise<Array<Object>>} The groups that changed
 */
export async function markJobsArchivedInGroups(archivedJobs) {
  const jobs = (archivedJobs ?? []).filter((job) => job?.groupID);
  if (jobs.length === 0) return [];

  const { jobData, account } = useUsersStore.getState();
  const { groupArray, jobArray } = jobData;
  const groups = workingGroups((groupID) =>
    groupArray.find((group) => group.groupID === groupID),
  );

  const byGroupID = Map.groupBy(jobs, (job) => job.groupID);
  const changed = [];
  for (const [groupID, groupJobs] of byGroupID) {
    const group = groups.get(groupID);
    if (!group) continue;
    group.markJobsArchived(groupJobs, jobArray);
    changed.push(group);
  }
  if (changed.length === 0) return [];

  if (account.isLoggedIn) {
    try {
      await putJobGroupsBatch(changed.map((group) => group.toDocument()));
    } catch (err) {
      console.error("The archived jobs' groups could not be saved", err);
      showSnackbarWarning(
        "The job was archived, but its group could not be updated. Reload to see it.",
        8,
      );
      return [];
    }
  }
  jobData.actions.updateModifiedGroups(changed);
  return changed;
}
