/**
 * Shared per-stage sorting for planner UIs (job planner accordion + group planner accordion).
 *
 * Sorting compares canonical `Job` instances the same way in both surfaces.
 */

/**
 * @param {Object} job - Canonical `Job`
 * @returns {boolean}
 */
const areAllMaterialsPurchased = (job) => {
  const totalMaterials = job?.build?.materials?.length ?? 0;
  return job.totalCompletedMaterials() === totalMaterials;
};

/**
 * Purchasing stage: all materials purchased first, then alphabetical by name.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
const purchasingStageSort = (a, b) => {
  const aAll = areAllMaterialsPurchased(a);
  const bAll = areAllMaterialsPurchased(b);
  if (aAll !== bAll) {
    return aAll ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
};

const SORTING_METHODS = {
  1: purchasingStageSort,
};

/**
 * @param {number} statusId
 * @returns {((a: object, b: object) => number) | undefined}
 */
export const getSortingMethodForPlannerStage = (statusId) =>
  SORTING_METHODS[statusId];

/**
 * Applies stage-specific sorting when a comparator exists; otherwise returns the same array reference.
 *
 * @param {object[]} jobs
 * @param {number} statusId
 * @returns {object[]}
 */
export function sortJobsForPlannerStage(jobs, statusId) {
  const sortingMethod = getSortingMethodForPlannerStage(statusId);
  if (!sortingMethod) {
    return jobs;
  }
  return [...jobs].sort(sortingMethod);
}
