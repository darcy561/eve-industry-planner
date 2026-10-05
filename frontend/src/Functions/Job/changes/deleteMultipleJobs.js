import {
  applyCommands,
  removeChildJob,
  removeParentJob,
} from "../../../Components/Edit Job/Edit Job Hooks/jobCommands";
import {
  nothingChangedMessage,
  readJobsForAChange,
  releaseEsiLinksOf,
  sendChangeFromRead,
} from "./jobChange.js";
import { workingGroups, workingJobs } from "./workingCopies.js";
import {
  showSnackbarError,
  showSnackbarWarning,
} from "../../../Events/snackbarEvents";
import useUsersStore from "../../../Zustand/usersStore";
import { asIDList } from "../../Helper/ids";

/**
 * Deletes jobs and unlinks them from what they were built with, as one change that lands whole or
 * not at all.
 *
 * @param {string|Array<string>|Set<string>} inputJobIDs - Job ID(s) to delete
 * @returns {Promise<boolean>} Whether the jobs are gone
 */
export default async function deleteMultipleJobs(inputJobIDs) {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const selectedJobIDs = [...new Set(asIDList(inputJobIDs).filter(Boolean))];

  let read = [];
  if (isLoggedIn && selectedJobIDs.length > 0) {
    const fetched = await readJobsForAChange(selectedJobIDs, "deleted");
    if (!fetched) return false;
    if (fetched.held.length > 0) {
      showSnackbarWarning(
        nothingChangedMessage("deleted", { moved: fetched.held }),
        8,
      );
      return false;
    }
    read = fetched.read;
  }

  const { groupArray, jobArray, actions } = useUsersStore.getState().jobData;
  const selectedJobIDSet = new Set(selectedJobIDs);
  const jobsToDelete = selectedJobIDs
    .map((jobID) => actions.findJobInJobArray(jobID))
    .filter(Boolean);

  if (jobsToDelete.length === 0) {
    showSnackbarError("0 Job/Jobs Deleted", 3);
    return true;
  }

  const working = workingJobs(actions.findJobInJobArray);
  const groups = workingGroups((groupID) =>
    groupArray.find((group) => group.groupID === groupID),
  );
  const unlinked = new Set();
  const deletedByGroupID = new Map();

  for (const inputJob of jobsToDelete) {
    for (const mat of Object.values(inputJob.build.materials ?? {})) {
      for (const jobID of inputJob.build.childJobs?.[mat.typeID] ?? []) {
        if (selectedJobIDSet.has(jobID)) continue;
        const child = working.get(jobID);
        if (!child) continue;
        applyCommands(child, removeParentJob(inputJob.jobID));
        unlinked.add(child.jobID);
      }
    }

    for (const parentJobID of asIDList(
      inputJob.parentJobs ?? inputJob.parentJob,
    )) {
      if (selectedJobIDSet.has(parentJobID)) continue;
      const parentJob = working.get(parentJobID);
      if (!parentJob || !parentJob.build.childJobs[inputJob.itemID]) continue;
      applyCommands(parentJob, removeChildJob(inputJob.itemID, inputJob.jobID));
      unlinked.add(parentJob.jobID);
    }

    if (inputJob.groupID) {
      const inGroup = deletedByGroupID.get(inputJob.groupID) ?? [];
      inGroup.push(inputJob);
      deletedByGroupID.set(inputJob.groupID, inGroup);
    }
  }

  const remainingJobs = jobArray
    .map((job) => working.taken(job.jobID) ?? job)
    .filter((job) => !selectedJobIDSet.has(job.jobID));
  const groupsToPersist = [];
  for (const [groupID, deleted] of deletedByGroupID) {
    const group = groups.get(groupID);
    if (!group) continue;
    group.removeJobsFromGroup(deleted, remainingJobs);
    groupsToPersist.push(group);
  }

  const jobsToPersist = [...unlinked].map((jobID) => working.taken(jobID));

  if (isLoggedIn) {
    const sent = await sendChangeFromRead({
      read,
      jobs: jobsToPersist,
      removed: jobsToDelete,
    });
    if (!sent.landed) {
      if (sent.moved) {
        showSnackbarWarning(
          nothingChangedMessage("deleted", { moved: sent.moved }),
          8,
        );
      }
      return false;
    }
  }

  const jobsToDeleteIDs = jobsToDelete.map(({ jobID }) => jobID);
  if (groupsToPersist.length > 0) {
    actions.updateModifiedGroups(groupsToPersist);
  }
  if (jobsToPersist.length > 0) {
    actions.updateOrAddJobsToJobArray(jobsToPersist);
  }
  actions.removeJobsFromJobArray(jobsToDeleteIDs);
  actions.removeFromMultiSelect(jobsToDeleteIDs);

  await releaseEsiLinksOf(jobsToDelete, "deleted");

  showSnackbarError(`${jobsToDeleteIDs.length} Job/Jobs Deleted`, 3);
  return true;
}
