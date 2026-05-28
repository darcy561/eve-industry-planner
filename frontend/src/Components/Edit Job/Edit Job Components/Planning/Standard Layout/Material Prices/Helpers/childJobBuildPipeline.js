import getMissingESIData from "../../../../../../../Functions/Shared/getMissingESIData";
import { recalculateInstallCostsWithNewData } from "../../../../../../../Functions/Installation Costs/installCosts";
import { buildJob } from "../../../../../../../Functions/JobPlanner/buildJob";
import useUsersStore from "../../../../../../../Zustand/usersStore";

export function asJobArray(jobs) {
  if (jobs == null) return [];
  return Array.isArray(jobs) ? jobs : [jobs];
}

export async function buildChildJobs(buildRequest, { queryClient } = {}) {
  const builtJobs = await buildJob(buildRequest, { queryClient });
  return asJobArray(builtJobs).filter(Boolean);
}

export async function hydrateChildJobsWithMissingData(inputJobs) {
  const jobs = asJobArray(inputJobs).filter(Boolean);
  if (jobs.length === 0) {
    return { requestedMarketData: {}, requestedSystemIndexes: {} };
  }

  const { requestedMarketData, requestedSystemIndexes } =
    await getMissingESIData(jobs);

  recalculateInstallCostsWithNewData(
    jobs,
    requestedMarketData,
    requestedSystemIndexes
  );

  useUsersStore.getState().worldData.actions.addMarketData(requestedMarketData);
  useUsersStore
    .getState()
    .worldData.actions.addSystemIndex(requestedSystemIndexes);

  return { requestedMarketData, requestedSystemIndexes };
}
