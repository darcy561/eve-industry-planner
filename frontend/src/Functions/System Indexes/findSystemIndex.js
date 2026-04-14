import doesSystemIndexRequireRefresh from "./refreshPeriod";
import useUsersStore from "../../Zustand/usersStore";
import splitSystemIndexesRequestIntoChuncks from "./requestChunks";

export const MAX_SYSTEM_INDEXES_PER_REQUEST = 500;
/**
 * Retrieves system indexes for given system IDs, checking cache and refresh requirements.
 * Returns cached data if fresh, otherwise fetches from the API.
 * 
 * @param {number|Array<number>|Set<number>} inputIDs - System ID(s) to get indexes for
 * @returns {Promise<Object>} Promise that resolves to system index data object
 * 
 * @example
 * const indexes = await getSystemIndexes([30000142, 30002187]);
 * console.log(indexes); // { 30000142: { solar_system_id: 30000142, manufacturing: 0.1, ... }, 30002187: { solar_system_id: 30002187, manufacturing: 0.2, ... } }
 */
async function getSystemIndexes(inputIDs) {
  if (!inputIDs) return {};

  if (Array.isArray(inputIDs)) {
    inputIDs = new Set(inputIDs);
  } else if (typeof inputIDs === "number") {
    inputIDs = new Set([inputIDs]);
  }

  const requiredIDArray = findRequiredSystemIndexes(inputIDs);

  if (requiredIDArray.length === 0) return {};

  // Fetch all batches in parallel and merge results
  const batchPromises = splitSystemIndexesRequestIntoChuncks(requiredIDArray);
  const batchResults = await Promise.all(batchPromises);

  // Merge all batch results into a single object
  const returnData = Object.assign({}, ...batchResults);

  return returnData;
}

/**
 * Finds system IDs that require system index data refresh.
 * Checks cache and determines which systems need updated data.
 * 
 * @param {Set<number>} inputSet - Set of system IDs to check
 * @returns {Array<number>} Array of system IDs that need refresh
 * 
 * @private
 */
function findRequiredSystemIndexes(inputSet) {
  let idsToRequest = new Set();
  for (const id of inputSet) {
    const matchedSystemIndex =
      useUsersStore.getState().worldData.systemIndexes[id];
    if (!matchedSystemIndex) {
      idsToRequest.add(id);
    } else {
      if (doesSystemIndexRequireRefresh(matchedSystemIndex)) {
        idsToRequest.add(id);
      }
    }
  }
  return [...idsToRequest];
}

export default getSystemIndexes;
