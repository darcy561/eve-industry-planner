import fetchSystemIndexes from "../Endpoints/Public/systemIndexes";
import doesSystemIndexRequireRefresh from "./refreshPeriod";

/**
 * Refreshes outdated system indexes by fetching fresh data from the API.
 * Identifies which system indexes are outdated and fetches updated data.
 * 
 * @param {Object} systemIndexObject - Object containing system index data with solar_system_id property
 * @returns {Promise<Object>} Promise that resolves to refreshed system index data
 * 
 * @example
 * const refreshedIndexes = await refreshSystemIndexes({ 30000142: { solar_system_id: 30000142, lastUpdated: 1719859200 } });
 * console.log(refreshedIndexes); // Updated system index data
 */
async function refreshSystemIndexes(systemIndexObject) {
  const systemIndexValues = Object.values(systemIndexObject);
  const outdatedItems = [];

  for (let indexObject of systemIndexValues) {
    if (doesSystemIndexRequireRefresh(indexObject)) {
      outdatedItems.push(indexObject.solar_system_id);
    }
  }

  if (outdatedItems.length === 0) return {};

  return fetchSystemIndexes(outdatedItems);
}

export default refreshSystemIndexes;
