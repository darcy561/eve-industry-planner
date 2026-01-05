import convertMarketDataResponseToObject from "./convertResponse";
import doesMarketItemRequireRefresh from "./refreshPeriod";
import splitMarketDataRequestIntoChuncks from "./requestChunks";
import useUsersStore from "../../Zustand/usersStore";
import pollForProcessingItems from "./pollForProcessingItems";

/**
 * Fetches market data for specified item IDs with caching and processing support.
 * Handles both individual IDs and arrays, checks for required refreshes, and polls
 * for items that are still processing on the server.
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

  const returnedPrices = await Promise.allSettled(
    splitMarketDataRequestIntoChuncks(requiredIDArray)
  );

  const marketDataResults = convertMarketDataResponseToObject(returnedPrices);
  
  // // Check if any items are still processing and poll for them
  // const processingItems = Object.values(marketDataResults).filter(
  //   item => item.status === 'processing'
  // );
  
  // if (processingItems.length > 0) {
  //   console.log(`${processingItems.length} items still processing, polling for updates...`);
  //   await pollForProcessingItems(processingItems, marketDataResults);
  // }

  // // Safety filter: Remove any remaining processing objects (in case polling failed)
  // const finalResults = Object.fromEntries(
  //   Object.entries(marketDataResults).filter(([key, value]) => 
  //     !value.status || value.status !== 'processing'
  //   )
  // );

  return marketDataResults;
}

/**
 * Determines which item IDs need to be requested from the market data API.
 * Checks existing cached data and refresh requirements to minimize unnecessary API calls.
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
