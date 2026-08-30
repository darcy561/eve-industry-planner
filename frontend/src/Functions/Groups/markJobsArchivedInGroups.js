import useUsersStore from "../../Zustand/usersStore.js";
import Group from "../../Classes/group.js";
import { putJobGroupsBatch } from "../Endpoints/Private/groups.js";

/**
 * Records archived jobs against the groups they belong to.
 *
 * An archived job stays a member: `includedJobIDs` keeps it and `archivedJobIDs`
 * marks it as held in the archive.
 *
 * @param {Array<Object>} archivedJobs — jobs that have just been archived
 * @returns {Promise<Group[]>} the groups that changed
 */
export async function markJobsArchivedInGroups(archivedJobs) {
  const jobs = (archivedJobs ?? []).filter((job) => job?.groupID);
  if (jobs.length === 0) return [];

  const { jobData, account } = useUsersStore.getState();
  const { groupArray, jobArray } = jobData;
  const { updateModifiedGroups } = jobData.actions;

  const byGroupID = new Map();
  for (const job of jobs) {
    if (!byGroupID.has(job.groupID)) byGroupID.set(job.groupID, []);
    byGroupID.get(job.groupID).push(job);
  }

  const changed = [];
  for (const [groupID, groupJobs] of byGroupID) {
    const source = groupArray.find((group) => group.groupID === groupID);
    if (!source) continue;
    const working = new Group(source.toDocument());
    working.markJobsArchived(groupJobs, jobArray);
    changed.push(working);
  }
  if (changed.length === 0) return [];

  if (account.isLoggedIn) {
    await putJobGroupsBatch(changed.map((group) => group.toDocument()));
  }
  updateModifiedGroups(changed);
  return changed;
}

export default markJobsArchivedInGroups;
