import fetchMarketPrices from "../Endpoints/Public/marketPrices";
import doesMarketItemRequireRefresh from "./refreshPeriod";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Fetches market data for specified item IDs using the cache and public API when stale.
 * Handles individual IDs, arrays, or sets; only requests IDs that are missing or past refresh TTL.
 * 
 * @param {string|number|Array<string|number>|Set<string|number>} inputIDs - Item ID(s) to fetch market data for
 * @returns {Promise<Object>} Promise that resolves to market data object with item IDs as keys
 * 
 * @example
 * // Single item ID
 * const marketData = await getMarketData(34);
 * console.log(marketData[34].price); // Item price
 * 
 * @example
 * // Multiple item IDs
 * const marketData = await getMarketData([34, 35, 36]);
 * 
 * @example
 * // Set of item IDs
 * const itemSet = new Set([34, 35, 36]);
 * const marketData = await getMarketData(itemSet);
 */
async function getMarketData(inputIDs) {
  if (!inputIDs) return {};

  if (Array.isArray(inputIDs)) {
    inputIDs = new Set(inputIDs);
  }

  const requiredIDArray = findRequiredPrices(inputIDs);

  return fetchMarketPrices(requiredIDArray);
}

/**
 * Determines which item IDs need to be requested from the market data API.
 * Checks existing cached data and refresh requirements to minimise unnecessary API calls.
 * 
 * @param {Set<string|number>} inputSet - Set of item IDs to check
 * @returns {Array<string|number>} Array of item IDs that need to be requested
 * 
 * @private
 */
function findRequiredPrices(inputSet) {
  let idsToRequest = new Set();
  for (const id of inputSet) {
    const currentPriceObject =
      useUsersStore.getState().worldData.marketData[id];
    if (!currentPriceObject) {
      idsToRequest.add(id);
    } else {
      if (doesMarketItemRequireRefresh(currentPriceObject)) {
        idsToRequest.add(id);
      }
    }
  }
  return [...idsToRequest];
}

export default getMarketData;
