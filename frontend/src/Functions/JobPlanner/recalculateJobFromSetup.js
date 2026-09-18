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
 */
export default async function recalculateJobFromSetup(
  setupObject,
  state,
  actions,
) {
  const systemIndexResults = await getSystemIndexes(setupObject.systemID);

  // The index lands before the job does: install costs are worked out while
  // rendering, and a job shown against an index the store has not been given
  // yet is costed at zero.
  useUsersStore.getState().worldData.actions.addSystemIndex(systemIndexResults);

  state.activeJob.recalculateSelectedSetup(setupObject.id);
  actions.updateActiveJob(state.activeJob);
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
  queryClient,
) {
  materialObject[requestedTypeID].recalculateSelectedSetup(setupID);

  if (requestedTypeID !== mainTypeID) return;

  const mainJob = materialObject[mainTypeID];
  for (const material of mainJob.build.materials) {
    if (!checkJobTypeIsBuildable(material.jobType)) continue;

    const materialJob = materialObject[material.typeID];
    recalculateJobForNewTotal(materialJob, material.quantity, queryClient);
  }
}
