import {
  asJobArray,
  hydrateChildJobsWithMissingData,
} from "./childJobBuildPipeline";

/**
 * Shared post-build path for child jobs: fetch missing ESI data, recalc install costs,
 * mark jobs for addition, push market/system data into the world store.
 *
 * Matches Material Prices "Create All Child Jobs" behavior. Callers pass the same
 * split as bulk: `jobsForMissingDataAndRecalc` is what `getMissingESIData` / recalc
 * see (usually newly built jobs only); `jobsToMarkForAddition` is what is passed to
 * `markChildJobsForAddition` (may include linked group jobs with no new build).
 *
 * @param {Object} params
 * @param {unknown|unknown[]} params.jobsForMissingDataAndRecalc
 * @param {unknown|unknown[]} params.jobsToMarkForAddition
 * @param {{ markChildJobsForAddition: (jobs: unknown) => void }} params.actions
 */
export async function finalizeCreatedChildJobs({
  jobsForMissingDataAndRecalc,
  jobsToMarkForAddition,
  actions,
}) {
  const markList = asJobArray(jobsToMarkForAddition).filter(Boolean);
  if (markList.length === 0) return;

  await hydrateChildJobsWithMissingData(jobsForMissingDataAndRecalc);

  actions.markChildJobsForAddition(markList);
}
