import getSystemIndexes from "../System Indexes/findSystemIndex";
import useUsersStore from "../../Zustand/usersStore";
import checkJobTypeIsBuildable from "../Helper/checkJobTypeIsBuildable";
import recalculateJobForNewTotal from "./recalculateJobForNewTotal";

/**
 * Recalculate the active job from a single setup change and persist
 * updated system index data into world state.
 *
 * @param {Object} setupObject
 * @param {Object} state
 * @param {Object} actions
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 */
export default async function recalculateJobFromSetup(
  setupObject,
  state,
  actions,
  queryClient
) {
  const systemIndexResults = await getSystemIndexes(setupObject.systemID);

  state.activeJob.recalculateSelectedSetup(
    setupObject.id,
    queryClient,
    undefined,
    systemIndexResults
  );

  actions.updateActiveJob(state.activeJob);
  useUsersStore.getState().worldData.actions.addSystemIndex(systemIndexResults);
}

/**
 * Recalculate watchlist setup and dependent buildable material jobs.
 *
 * @param {number|string} requestedTypeID
 * @param {number|string} mainTypeID
 * @param {string} setupID
 * @param {Record<string, Object>} materialObject
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 */
export function recalculateWatchListItemsFromSetup(
  requestedTypeID,
  mainTypeID,
  setupID,
  materialObject,
  queryClient
) {
  materialObject[requestedTypeID].recalculateSelectedSetup(setupID, queryClient);

  if (requestedTypeID !== mainTypeID) return;

  const mainJob = materialObject[mainTypeID];
  for (const material of mainJob.build.materials) {
    if (!checkJobTypeIsBuildable(material.jobType)) continue;

    const materialJob = materialObject[material.typeID];
    recalculateJobForNewTotal(materialJob, material.quantity, queryClient);
  }
}
