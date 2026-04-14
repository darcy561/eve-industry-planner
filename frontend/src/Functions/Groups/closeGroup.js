import uploadGroupsToFirebase from "../../Functions/Firebase/uploadGroupData";
import firebaseBatchUpdateJobs from "../../Functions/Firebase/batchUpdateJobs";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Closes a group of jobs, updating relationships and saving to Firebase.
 * Removes parent-child relationships that are not included in the group,
 * rebuilds relationships within the group, and saves changes to Firebase.
 *
 * @param {Array} groupJobs - Jobs in the group to close
 * @returns {Promise<void>} Promise that resolves when group is closed and saved
 *
 * @example
 * const jobsToClose = [job1, job2, job3];
 * await closeActiveGroup(jobsToClose);
 * console.log("Group closed successfully");
 */
export default async function closeActiveGroup(groupJobs) {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const { jobArray } = useUsersStore.getState().jobData;
  const {
    clearMultiSelect,
    setActiveGroupID,
    getActiveGroupObject,
    addJobsToUserJobSnapshotArray,
    updateModifiedGroups,
    replaceJobArray,
  } = useUsersStore.getState().jobData.actions;

  const groupEntry = getActiveGroupObject();
  if (!groupEntry) {
    // If no active group, just return early
    return;
  }

  const jobsToSave = new Set();
  const jobsToAddToUserJobSnapshot = [];

  groupEntry.updateGroupData(groupJobs);

  const filteredJobs = jobArray.filter((job) =>
    groupJobs.some((groupJob) => groupJob.jobID === job.jobID)
  );

  const newJobArray = filteredJobs.map((job) => {
    if (!groupEntry.includedJobIDs.has(job.jobID)) return job;

    job.removeParentJobsNotIncludedInInput(groupEntry.includedJobIDs);
    job.removeChildJobsNotIncludedInInputFromAllMaterials(
      groupEntry.includedJobIDs
    );

    if (job.isReadyToSell) {
      jobsToAddToUserJobSnapshot.push(job);
    }
    jobsToSave.add(job.jobID);
    return job;
  });

  // Rebuild job relationships
  for (const startingJob of newJobArray) {
    if (!groupEntry.includedJobIDs.has(startingJob.jobID)) continue;

    // Handle parent relationships
    for (const parentID of startingJob.parentJobs) {
      let parentMatch = newJobArray.find((i) => i.jobID === parentID);
      if (!parentMatch) continue;
      let materialMatch = parentMatch.build.childJobs[startingJob.itemID];
      if (!materialMatch) continue;
      if (!materialMatch.includes(startingJob.jobID)) {
        parentMatch.addChildJob(startingJob.itemID, startingJob.jobID);
        jobsToSave.add(parentMatch.jobID);  
      }
    }

    // Handle child relationships
    for (const startingMaterial of startingJob.build.materials) {
      for (const childID of startingJob.build.childJobs[
        startingMaterial.typeID
      ]) {
        let childMatch = newJobArray.find((i) => i.jobID === childID);
        if (!childMatch) continue;
        if (!childMatch.parentJobs.includes(startingJob.jobID)) {
          childMatch.addParentJob(startingJob.jobID);
          jobsToSave.add(childMatch.jobID);
        }
      }
    }
  }

  try {
    setActiveGroupID(null);
    replaceJobArray(newJobArray);
    addJobsToUserJobSnapshotArray(jobsToAddToUserJobSnapshot);
    updateModifiedGroups(groupEntry);
    clearMultiSelect();

    if (isLoggedIn) {
      const updatedJobs = newJobArray.filter((job) =>
        jobsToSave.has(job.jobID)
      );
      await Promise.all([
        uploadGroupsToFirebase(),
        firebaseBatchUpdateJobs(updatedJobs),
      ]);
    }
  } catch (error) {
    console.error("Error saving to Firebase:", error);
    throw error;
  }
}
