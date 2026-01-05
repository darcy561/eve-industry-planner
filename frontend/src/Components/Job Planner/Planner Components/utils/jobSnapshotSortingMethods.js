/**
 * To add a new sorting method:
 * 1. Create a sorting function that takes two job snapshots (a, b) and returns a number
 * 2. Add it to the SORTING_METHODS object with the status ID as the key
 *
 * @example
 * // Add a new sorting method for status ID 2
 * SORTING_METHODS[2] = (a, b) => {
 *   // Your custom sorting logic
 *   return comparisonResult;
 * };
 */

/**
 * Helper function to determine if all materials are purchased for a job snapshot
 * Job snapshots use totalMaterials and totalComplete instead of build.materials
 *
 * @param {Object} jobSnapshot - Job snapshot object
 * @returns {boolean} True if all materials are purchased
 */
const areAllMaterialsPurchased = (jobSnapshot) => {
  return jobSnapshot.totalComplete === jobSnapshot.totalMaterials;
};

/**
 * Purchasing stage sorting method for job snapshots
 * Sorts jobs by materials purchased status (all purchased first),
 * then alphabetically within each group
 *
 * @param {Object} a - First job snapshot
 * @param {Object} b - Second job snapshot
 * @returns {number} Comparison result
 */
const purchasingStageSort = (a, b) => {
  const aAllMaterialsPurchased = areAllMaterialsPurchased(a);
  const bAllMaterialsPurchased = areAllMaterialsPurchased(b);

  // First sort by materials purchased status (all purchased first)
  if (aAllMaterialsPurchased !== bAllMaterialsPurchased) {
    return aAllMaterialsPurchased ? -1 : 1;
  }

  // Then sort alphabetically by name
  return a.name.localeCompare(b.name);
};

/**
 * Mapping of status IDs to their corresponding sorting methods for job snapshots
 *
 * Status IDs:
 * 0 - Planning
 * 1 - Purchasing
 * 2 - Building
 * 3 - Complete
 * 4 - For Sale
 *
 * To add a new sorting method, simply add an entry here:
 * @example
 * SORTING_METHODS[2] = (a, b) => {
 *   // Custom sorting for Building stage
 *   return a.name.localeCompare(b.name);
 * };
 */
export const SORTING_METHODS = {
  1: purchasingStageSort, // Purchasing stage
  // Add more methods here as needed
  // 2: buildingStageSort,
  // 3: completeStageSort,
};

/**
 * Gets the appropriate sorting function for a given status ID
 * Returns undefined if no method is defined
 *
 * @param {number} statusId - The job status ID
 * @returns {Function|undefined} Sorting function or undefined
 */
export const getSortingMethod = (statusId) => {
  return SORTING_METHODS[statusId];
};

/**
 * Applies the appropriate sorting method to an array of job snapshots
 * Uses the statusId to determine which sorting method to apply
 * If no sorting method is defined for the status, returns snapshots as-is
 *
 * @param {Array} jobSnapshots - Array of job snapshot objects
 * @param {number} statusId - The status ID to determine which sorting method to use
 * @returns {Array} Sorted array of job snapshots (or original array if no method defined)
 */
export const sortJobSnapshots = (jobSnapshots, statusId) => {
  const sortingMethod = getSortingMethod(statusId);

  // If no sorting method is defined for this status, do nothing
  if (!sortingMethod) {
    return jobSnapshots;
  }

  // Apply the sorting method
  return [...jobSnapshots].sort(sortingMethod);
};
