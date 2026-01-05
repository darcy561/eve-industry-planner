import convertMarketDataResponseToObject from "./convertResponse";
import doesMarketItemRequireRefresh from "./refreshPeriod";
import splitMarketDataRequestIntoChuncks from "./requestChunks";

/**
 * Refreshes outdated market data by fetching new prices for items that require updates.
 * Identifies items that need refresh based on their last updated timestamp and fetches
 * new data in parallel chunks for efficiency.
 * 
 * @param {Object} evePricesObject - Object containing current market price data
 * @returns {Promise<Object>} Promise that resolves to updated market data object
 * 
 * @example
 * const currentPrices = { 34: { typeID: 34, lastUpdated: oldTimestamp } };
 * const updatedPrices = await refreshMarketData(currentPrices);
 * console.log(updatedPrices[34].price); // New price data
 */
async function refreshMarketData(evePricesObject) {
  const outdatedPriceIDSet = new Set();

  Object.values(evePricesObject).forEach((item) => {
    if (doesMarketItemRequireRefresh(item)) {
      outdatedPriceIDSet.add(item.typeID);
    }
  });

  const returnedPrices = await Promise.allSettled(
    splitMarketDataRequestIntoChuncks([...outdatedPriceIDSet])
  );

  return convertMarketDataResponseToObject(returnedPrices);
}

export default refreshMarketData;
