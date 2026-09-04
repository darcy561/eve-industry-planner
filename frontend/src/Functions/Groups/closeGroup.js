import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import { flushPendingGroupSave } from "../Debounce/jobGroupsPersistSchedule.js";
import normaliseParentChildRelationships from "../Shared/normaliseParentChildRelationships.js";
import { canPersistGroupClose } from "../DocumentLock/canPersistDocumentEditClose.js";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Closes a group of jobs, updating relationships and saving job/group documents.
 * Removes parent-child relationships that are not included in the group,
 * rebuilds relationships within the group, and persists changes via API.
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
    // If no active group, just return early
    return;
  }

  const modifiedJobIDsToPersist = new Set();

  activeGroup.updateGroupData(groupJobs);

  const groupJobsInStore = jobArray.filter((job) =>
    groupJobs.some((groupJob) => groupJob.jobID === job.jobID)
  );

  const updatedGroupJobs = groupJobsInStore.map((job) => {
    if (!activeGroup.includedJobIDs.has(job.jobID)) return job;

    job.removeParentJobsNotIncludedInInput(activeGroup.includedJobIDs);
    job.removeChildJobsNotIncludedInInputFromAllMaterials(
      activeGroup.includedJobIDs
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
    // Only patch the affected group jobs; keep non-group planner rows intact.
    updateOrAddJobsToJobArray(updatedGroupJobs);
    updateModifiedGroups(activeGroup, { queuePersist: persistToServer });
    clearMultiSelect();

    if (persistToServer) {
      const updatedJobs = updatedGroupJobs.filter((job) =>
        modifiedJobIDsToPersist.has(job.jobID)
      );
      await Promise.all([
        flushPendingGroupSave(),
        saveJobsViaApi(updatedJobs),
      ]);
    } else if (isLoggedIn && groupID) {
      useUsersStore
        .getState()
        .jobData.actions.clearPendingJobGroupWrites(groupID);
    }
  } catch (error) {
    console.error("Error saving group close changes:", error);
    throw error;
  }
}
