import { isReadyToBuild } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";

/**
 * Jobs eligible for a workflow stage on the global job planner grid.
 *
 * @param {object[]} jobArray
 * @param {number|string} statusId
 * @returns {object[]}
 */
export function filterJobsForJobPlannerStage(jobArray, statusId) {
  return jobArray.filter(
    (job) => job.displayOnPlanner && Number(job.jobStatus) === Number(statusId),
  );
}

/**
 * Groups eligible for a workflow stage on the job planner (unsorted).
 *
 * @param {object[]} groupArray
 * @param {number|string} statusId
 * @returns {object[]}
 */
export function filterGroupsForJobPlannerStage(groupArray, statusId) {
  return groupArray.filter(
    (group) => Number(group.groupStatus) === Number(statusId),
  );
}

/**
 * Jobs to show for the active group. Nothing is shown without one.
 *
 * @param {object[]} plannerJobs — jobs already scoped to the group + stage
 * @param {object|null} activeGroupObject
 * @returns {object[]}
 */
export function filterJobsVisibleInActiveGroup(plannerJobs, activeGroupObject) {
  return activeGroupObject ? plannerJobs : [];
}

/**
 * Purchasing stage: all materials purchased first, then alphabetical by name.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
const purchasingStageSort = (a, b) => {
  const aAll = isReadyToBuild(a);
  const bAll = isReadyToBuild(b);
  if (aAll !== bAll) {
    return aAll ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
};

const SORTING_METHODS = {
  1: purchasingStageSort,
};

/**
 * Applies stage-specific sorting when a comparator exists; otherwise returns the same array
 * reference.
 *
 * @param {object[]} jobs
 * @param {number} statusId
 * @returns {object[]}
 */
export function sortJobsForPlannerStage(jobs, statusId) {
  const sortingMethod = SORTING_METHODS[statusId];
  if (!sortingMethod) {
    return jobs;
  }
  return [...jobs].sort(sortingMethod);
}
