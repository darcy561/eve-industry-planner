/**
 * Gets the current linked child job IDs for a specific material type.
 *
 * Combines the job's own child jobs with the pending additions and the temporary
 * one, then drops anything pending removal, so the answer is what the reader has
 * chosen rather than what has been saved.
 *
 * @param {number} materialTypeID - The material type ID to get child jobs for
 * @param {Object} activeJob - The currently active job object
 * @param {Object} temporaryChildJobs - Temporary child jobs data
 * @param {Object} parentChildToEdit - Pending parent-child relationship changes
 * @returns {Array<string>} Array of unique child job IDs currently linked to the material
 */
function getCurrentLinkedChildJobIDsForMaterial(
  materialTypeID,
  activeJob,
  temporaryChildJobs,
  parentChildToEdit,
) {
  return [
    ...new Set(
      [
        ...(activeJob.build.childJobs[materialTypeID] ?? []),
        ...(temporaryChildJobs[materialTypeID]
          ? [temporaryChildJobs[materialTypeID].jobID]
          : []),
        ...(parentChildToEdit.childJobs[materialTypeID]?.add || []),
      ].filter(
        (jobID) =>
          !parentChildToEdit.childJobs[materialTypeID]?.remove?.includes(jobID),
      ),
    ),
  ];
}

export default getCurrentLinkedChildJobIDsForMaterial;
