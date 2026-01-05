/**
 * Current Linked Child Job IDs for Material Function for EVE Industry Planner.
 * 
 * Calculates the current set of linked child job IDs for a specific material type,
 * considering active job child jobs, temporary child jobs, and pending parent-child
 * relationship changes. This function provides the definitive list of child jobs
 * that are currently linked to a material after applying all pending modifications.
 * 
 * @fileoverview Function for calculating current linked child job IDs for materials
 * @author EVE Industry Planner Team
 */

/**
 * Gets the current linked child job IDs for a specific material type.
 * 
 * Combines child jobs from multiple sources (active job, temporary jobs, pending additions)
 * and removes any jobs marked for removal to provide the current state of linked
 * child jobs for a material. Uses Set to ensure unique job IDs.
 * 
 * @param {number} materialTypeID - The material type ID to get child jobs for
 * @param {Object} activeJob - The currently active job object
 * @param {Object} activeJob.build - Job build data
 * @param {Object} activeJob.build.childJobs - Child jobs by material type ID
 * @param {Object} temporaryChildJobs - Temporary child jobs data
 * @param {Object} parentChildToEdit - Pending parent-child relationship changes
 * @param {Object} parentChildToEdit.childJobs - Child job changes by material type
 * @param {Array} parentChildToEdit.childJobs[materialTypeID]?.add - Jobs to add
 * @param {Array} parentChildToEdit.childJobs[materialTypeID]?.remove - Jobs to remove
 * @returns {Array<string>} Array of unique child job IDs currently linked to the material
 * 
 * @example
 * const materialTypeID = 34; // Tritanium
 * const currentChildJobs = getCurrentLinkedChildJobIDsForMaterial(
 *   materialTypeID,
 *   activeJob,
 *   temporaryChildJobs,
 *   parentChildToEdit
 * );
 * console.log('Current child jobs for Tritanium:', currentChildJobs);
 * 
 * @example
 * // Use in material card rendering
 * const linkedJobs = getCurrentLinkedChildJobIDsForMaterial(
 *   material.typeID,
 *   state.activeJob,
 *   state.temporaryChildJobs,
 *   state.parentChildToEdit
 * );
 * 
 * return (
 *   <MaterialCard>
 *     <ChildJobsList jobIDs={linkedJobs} />
 *   </MaterialCard>
 * );
 * 
 * @example
 * // Check if material has any linked child jobs
 * const hasChildJobs = getCurrentLinkedChildJobIDsForMaterial(
 *   materialTypeID,
 *   activeJob,
 *   temporaryChildJobs,
 *   parentChildToEdit
 * ).length > 0;
 */
function getCurrentLinkedChildJobIDsForMaterial(
  materialTypeID,
  activeJob,
  temporaryChildJobs,
  parentChildToEdit
) {
  return [
    ...new Set(
      [
        ...activeJob.build.childJobs[materialTypeID],
        ...(temporaryChildJobs[materialTypeID]
          ? [temporaryChildJobs[materialTypeID].jobID]
          : []),
        ...(parentChildToEdit.childJobs[materialTypeID]?.add || []),
      ].filter(
        (jobID) =>
          !parentChildToEdit.childJobs[materialTypeID]?.remove?.includes(jobID)
      )
    ),
  ];
}

export default getCurrentLinkedChildJobIDsForMaterial;
