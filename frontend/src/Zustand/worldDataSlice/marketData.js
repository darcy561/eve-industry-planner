/**
 * Market Data Management for EVE Industry Planner.
 * 
 * Handles market data operations including adding market data and finding
 * market data. Provides methods for managing market price data and
 * market data retrieval.
 * 
 * @fileoverview Market data management operations
 * @author EVE Industry Planner Team
 */

import GLOBAL_CONFIG from "../../global-config-app";

const { MARKET_OPTIONS } = GLOBAL_CONFIG;

/**
 * Market data management actions for world data slice.
 * 
 * Provides methods for managing market data including adding and finding
 * market price data.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Market data management actions
 */
export const marketDataActions = (set, get) => ({
  /**
   * Adds market data to the store.
   * 
   * Merges new market price data with existing data.
   * 
   * @param {Object} inputObject - Market data object
   * @param {Object} inputObject[typeID] - Market data for specific type ID
   * @param {number} inputObject[typeID].buy - Buy price
   * @param {number} inputObject[typeID].sell - Sell price
   * 
   * @example
   * store.getState().worldData.actions.addMarketData({
   *   34: { buy: 1000, sell: 1100 },
   *   35: { buy: 2000, sell: 2200 }
   * });
   */
  addMarketData: (inputObject = {}) => {
    set((state) => ({
      ...state,
      worldData: {
        ...state.worldData,
        marketData: {
          ...state.worldData.marketData,
          ...inputObject,
        },
      },
    }), false, "addMarketData");
  },

  /**
   * Finds market data by requested ID.
   * 
   * @param {number} requestedID - Type ID to search for
   * @param {Object} alternativeLocation - Alternative location to search in
   * @returns {Object|null} Market data object or null if not found
   * 
   * @example
   * const marketData = store.getState().worldData.actions.findMarketData(34);
   * if (marketData) console.log(marketData.buy);
   */
  findMarketData: (requestedID, alternativeLocation = {}) => {
    const state = get();
    return (
      state.worldData.marketData[requestedID] ||
      alternativeLocation[requestedID] ||
      MARKET_OPTIONS.reduce(
        (res, obj) => {
          res[obj.id] = {
            buy: 0,
            sell: 0,
          };
          return res;
        },
        { typeID: requestedID, lastUpdated: 0, adjustedPrice: 0 }
      )
    );
  },
});
