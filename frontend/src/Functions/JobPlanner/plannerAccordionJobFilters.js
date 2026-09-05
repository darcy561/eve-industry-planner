/**
 * Shared list shaping for job planner & group planner accordion bodies (before optional stage sort).
 */

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
