import useUsersStore from "../../../../../../../Zustand/usersStore";

/**
 * Resolve child jobs for a material from active links + pending edits + temp jobs.
 * Returns both IDs and object map so callers can reuse one canonical merge.
 */
export function resolveMaterialChildJobs({
  state,
  actions,
  materialTypeID,
  jobArray,
}) {
  const sourceJobs = Array.isArray(jobArray)
    ? jobArray
    : useUsersStore.getState().jobData.jobArray || [];

  const currentChildJobIDs = actions?.getCurrentMaterialChildJobs
    ? actions.getCurrentMaterialChildJobs(materialTypeID)
    : [];

  const childJobsById = new Map();
  currentChildJobIDs.forEach((jobID) => {
    const match = sourceJobs.find((job) => job.jobID === jobID);
    if (match) {
      childJobsById.set(match.jobID, match);
    }
  });

  const temporaryChildJob = state.temporaryChildJobs?.[materialTypeID];
  if (temporaryChildJob) {
    childJobsById.set(temporaryChildJob.jobID, temporaryChildJob);
  }

  const childJobIDs = [
    ...new Set([
      ...currentChildJobIDs,
      ...(temporaryChildJob ? [temporaryChildJob.jobID] : []),
    ]),
  ];

  return {
    childJobsById,
    childJobIDs,
    hasChildJobs: childJobIDs.length > 0,
  };
}

export function resolveMaterialChildJobStatus({
  state,
  materialTypeID,
  childJobsLocation = [],
  isExistingJobInGroup = false,
}) {
  const inGroup = Boolean(state.activeJob.includedInGroup);
  const hasLinked = Array.isArray(childJobsLocation) && childJobsLocation.length > 0;
  const tempJob = state.temporaryChildJobs?.[materialTypeID] || null;
  const hasTemp = Boolean(tempJob);
  const hasPendingAdd =
    (state.parentChildToEdit.childJobs?.[materialTypeID]?.add?.length || 0) > 0;
  const hasGroupMatch = Boolean(isExistingJobInGroup);

  return {
    inGroup,
    hasLinked,
    hasTemp,
    hasPendingAdd,
    hasGroupMatch,
    tempJob,
  };
}
