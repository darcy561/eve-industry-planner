import { totalQuantityProduced } from "../../../../../Edit Job Hooks/jobSelectors";
import recalculateJobForNewTotal from "../../../../../../../Functions/JobPlanner/recalculateJobForNewTotal";
import {
  asJobArray,
  hydrateChildJobsWithMissingData,
} from "./childJobBuildPipeline";

/**
 * Shared post-build path for child jobs: fetch missing ESI data, recalc install costs,
 * mark jobs for addition, push market/system data into the world store.
 *
 * Callers pass the same split as a bulk create: `jobsForMissingDataAndRecalc` is what `getMissingESIData` / recalc
 * see (usually newly built jobs only); `jobsToMarkForAddition` is what is passed to
 * `markChildJobsForAddition` (may include linked group jobs with no new build).
 *
 * @param {Object} params
 * @param {unknown|unknown[]} params.jobsForMissingDataAndRecalc
 * @param {unknown|unknown[]} params.jobsToMarkForAddition
 * @param {{ markChildJobsForAddition: (jobs: unknown) => void }} params.actions
 * @param {number} [params.requiredQuantity] - What the parent needs of the item
 *   these jobs produce
 * @param {import("@tanstack/react-query").QueryClient} [params.queryClient]
 */
export async function finaliseCreatedChildJobs({
  jobsForMissingDataAndRecalc,
  jobsToMarkForAddition,
  actions,
  requiredQuantity,
  queryClient,
}) {
  const markList = asJobArray(jobsToMarkForAddition).filter(Boolean);
  if (markList.length === 0) return;

  await hydrateChildJobsWithMissingData(jobsForMissingDataAndRecalc);

  resizeToRequirement(markList, requiredQuantity, queryClient);

  actions.markChildJobsForAddition(markList);
}

/**
 * Sizes a job being committed to what the parent actually needs.
 *
 * A job built for this row was sized to the requirement when it was built, and
 * the requirement moves whenever the parent's runs, efficiency or setup change.
 * Committing is the last moment the size can be fixed without the player having
 * to notice, and the panel has been costing it as though this happens — so it
 * has to happen.
 *
 * Only one job is resized: where several already produce the item they divide
 * the requirement between them, and resizing each to the whole of it would
 * multiply the output. Callers linking a job the group already runs pass no
 * requirement at all, since that job may be feeding something else.
 *
 * @param {Array<object>} jobs
 * @param {number} [requiredQuantity]
 * @param {import("@tanstack/react-query").QueryClient} [queryClient]
 */
function resizeToRequirement(jobs, requiredQuantity, queryClient) {
  if (!requiredQuantity || !queryClient || jobs.length !== 1) return;

  const [job] = jobs;
  if (totalQuantityProduced(job) === requiredQuantity) return;

  recalculateJobForNewTotal(job, requiredQuantity, queryClient);
}
