import GLOBAL_CONFIG from "../../global-config-app";

const { DEFAULT_ITEM_REFRESH_PERIOD } = GLOBAL_CONFIG;

/**
 * Determines if a market data item requires refresh based on its last updated timestamp.
 * Compares the item's lastUpdated time against the configured refresh period.
 * 
 * @param {Object} marketObject - Market data object containing lastUpdated timestamp
 * @param {number} marketObject.lastUpdated - Timestamp when the market data was last updated
 * @returns {boolean} True if the item requires refresh, false otherwise
 * 
 * @example
 * const marketItem = { lastUpdated: Date.now() - 2 * 60 * 60 * 1000 }; // 2 hours ago
 * const needsRefresh = doesMarketItemRequireRefresh(marketItem);
 * console.log(needsRefresh); // true if DEFAULT_ITEM_REFRESH_PERIOD < 2 hours
 */
function doesMarketItemRequireRefresh(marketObject) {
  const chosenRefreshPoint =
    Date.now() - DEFAULT_ITEM_REFRESH_PERIOD * 60 * 60 * 1000;

  if (marketObject.lastUpdated <= chosenRefreshPoint) {
    return true;
  }
  return false;
}

export default doesMarketItemRequireRefresh;
