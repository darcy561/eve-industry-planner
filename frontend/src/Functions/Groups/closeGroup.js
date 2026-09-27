import {
  applyCommands,
  keepOnlyChildJobs,
  keepOnlyParentJobs,
} from "../../Components/Edit Job/Edit Job Hooks/jobCommands";
import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import { flushPendingGroupSave } from "../Debounce/jobGroupsPersistSchedule.js";
import normaliseParentChildRelationships from "../Shared/normaliseParentChildRelationships.js";
import { canPersistGroupClose } from "../DocumentLock/canPersistDocumentEditClose.js";
import { showSnackbarWarning } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Closes a group of jobs, rebuilding the links between them and writing both the
 * jobs and the group.
 *
 * @param {Array} groupJobs - Jobs in the group to close
 * @returns {Promise<void>} Promise that resolves when group is closed and saved
 */
export default async function closeActiveGroup(groupJobs) {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const { jobArray } = useUsersStore.getState().jobData;
  const {
    clearMultiSelect,
    clearActiveGroupID,
    getActiveGroupObject,
    updateModifiedGroups,
    updateOrAddJobsToJobArray,
  } = useUsersStore.getState().jobData.actions;

  const activeGroup = getActiveGroupObject();
  if (!activeGroup) {
    return;
  }

  const modifiedJobIDsToPersist = new Set();

  activeGroup.updateGroupData(groupJobs);

  const groupJobsInStore = jobArray.filter((job) =>
    groupJobs.some((groupJob) => groupJob.jobID === job.jobID),
  );

  const updatedGroupJobs = groupJobsInStore.map((job) => {
    if (!activeGroup.includedJobIDs.has(job.jobID)) return job;

    applyCommands(
      job,
      keepOnlyParentJobs(activeGroup.includedJobIDs),
      keepOnlyChildJobs(activeGroup.includedJobIDs),
    );

    modifiedJobIDsToPersist.add(job.jobID);
    return job;
  });

  const normalizedJobIDs = normaliseParentChildRelationships(updatedGroupJobs);
  for (const jobID of normalizedJobIDs) {
    modifiedJobIDsToPersist.add(jobID);
  }

  const groupID = activeGroup.groupID;
  const persistToServer = isLoggedIn && canPersistGroupClose(groupID);

  try {
    clearActiveGroupID();
    updateOrAddJobsToJobArray(updatedGroupJobs);
    updateModifiedGroups(activeGroup, { queuePersist: persistToServer });
    clearMultiSelect();

    if (persistToServer) {
      const updatedJobs = updatedGroupJobs.filter((job) =>
        modifiedJobIDsToPersist.has(job.jobID),
      );
      await Promise.all([flushPendingGroupSave(), saveJobsViaApi(updatedJobs)]);
    } else if (isLoggedIn && groupID) {
      useUsersStore
        .getState()
        .jobData.actions.clearPendingJobGroupWrites(groupID);
      showSnackbarWarning(
        "You do not hold the lock on this group, so your changes were not saved.",
        8,
      );
    }
  } catch (error) {
    console.error("Error saving group close changes:", error);
    throw error;
  }
}
