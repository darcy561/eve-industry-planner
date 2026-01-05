import { error, log, warn } from "firebase-functions/logger";
import {
  DEFAULT_MARKET_LOCATIONS,
  DEFAULT_DAYS_FOR_MARKET_HISTORY,
  MAX_API_RETRIES,
} from "../global-config-functions.js";
import EventManager from "../Classes/eventManager.js";
import { getDatabase } from "firebase-admin/database";
import fetchWithCustomHeaders from "../util/fetchWithHeaders.js";

/**
 * Main function for querying EVE Online ESI market history data.
 * 
 * This function orchestrates the fetching of historical market data from EVE Online's ESI API:
 * - Processes arrays of type IDs for market history fetching
 * - Uses EventManager for concurrent processing with rate limiting
 * - Fetches market history from multiple regions simultaneously
 * - Filters data based on configured time periods
 * - Calculates market statistics (high/low prices, averages)
 * - Saves processed data directly to Firebase Realtime Database
 * 
 * @param {Array<number>|number} typeIDs - EVE Online type ID(s) to fetch market history for
 * @param {number} [maxRunTimeSeconds=0] - Maximum runtime in seconds (0 = no limit)
 * @returns {Promise<Object>} Results object with completed, failed, and incomplete arrays
 * 
 * @example
 * // Fetch market history for multiple type IDs
 * const results = await ESIMarketHistoryQuery([34, 35, 36], 300);
 * console.log(`Completed: ${results.completed.length}, Failed: ${results.failed.length}`);
 */
async function ESIMarketHistoryQuery(typeIDs = [], maxRunTimeSeconds = 0) {
  if (!Array.isArray(typeIDs)) {
    typeIDs = [typeIDs];
  }

  const eventManager = new EventManager(
    typeIDs,
    fetchTypeID,
    processRequestInfo,
    3,
    1000,
    maxRunTimeSeconds
  );

  const results = await eventManager.run();
  return results;
}

/**
 * Fetches market history data for a single type ID across all configured locations.
 * 
 * This function coordinates the fetching of market history for a specific type ID:
 * - Creates promises for each market location
 * - Fetches historical data from each region
 * - Handles errors and timeouts appropriately
 * - Returns structured data object with location-specific results
 * 
 * @param {number} typeID - EVE Online type ID to fetch market history for
 * @param {Object} limiter - Rate limiter instance for controlling API requests
 * @returns {Promise<Object>} Object containing typeID and location-specific market history
 * @throws {Error} Throws timeout/cancellation errors for EventManager handling
 * 
 * @example
 * const result = await fetchTypeID(34, limiter);
 * console.log(result.typeID); // 34
 * console.log(result.Jita); // Array of market history for Jita
 */
async function fetchTypeID(typeID, limiter) {
  const locationPromises = [];
  const resultsObj = { typeID };

  for (let location of DEFAULT_MARKET_LOCATIONS) {
    locationPromises.push(fetchMarketHistory(typeID, location, limiter));
    resultsObj[location.name] = null;
  }

  const results = await Promise.all(locationPromises);

  for (let result of results) {
    if (result instanceof Error) {
      if (result.code === 'RATE_LIMITER_CANCELLED' || result.message === 'EXECUTION_TIMEOUT' || result.name === 'AbortError') {
        throw result;
      }
      continue;
    }
    resultsObj[result.id] = result.data;
  }

  return resultsObj;
}

/**
 * Fetches market history data for a specific type ID and location.
 * 
 * This function makes a single API call to get market history:
 * - Calls ESI API for historical market data
 * - Handles rate limiting and retry logic
 * - Returns structured data with location identifier
 * 
 * @param {number} typeID - EVE Online type ID to fetch market history for
 * @param {Object} location - Location configuration object
 * @param {string} location.name - Location name (e.g., "Jita")
 * @param {number} location.regionID - EVE Online region ID
 * @param {Object} limiter - Rate limiter instance for controlling API requests
 * @returns {Promise<Object>} Object containing location name and market history data
 * @throws {Error} Throws timeout/cancellation errors for EventManager handling
 * 
 * @example
 * const result = await fetchMarketHistory(34, { name: "Jita", regionID: 10000002 }, limiter);
 * console.log(result.id); // "Jita"
 * console.log(result.data); // Array of market history entries
 */
async function fetchMarketHistory(typeID, location, limiter) {
  const { name, regionID } = location;
  const URL = `https://esi.evetech.net/v1/markets/${regionID}/history/?datasource=tranquility&type_id=${typeID}`;
  try {
    const data = await limiter.enqueue(
      fetchMarketHistoryWithRetry,
      URL,
      limiter
    );

    return { id: name, data };
  } catch (err) {
    // Check if it's a timeout/cancellation error
    if (err.code === 'RATE_LIMITER_CANCELLED' || err.message === 'EXECUTION_TIMEOUT') {
      throw err; // Re-throw timeout errors to be handled by EventManager
    }
    return { id: name, data: [] } // Return empty data for non-timeout errors
  }
}

/**
 * Fetches market history data from ESI API with retry logic.
 * 
 * This function implements robust API request handling for market history:
 * - Makes HTTP requests to EVE Online ESI API
 * - Handles rate limiting and abort signals
 * - Implements exponential backoff retry logic
 * - Distinguishes between timeout and other errors
 * - Returns raw market history data
 * 
 * @param {string} URL - Complete ESI API URL for market history
 * @param {Object} limiter - Rate limiter instance for controlling API requests
 * @param {number} [attempt=1] - Current attempt number for retry logic
 * @returns {Promise<Array<Object>>} Array of market history data from ESI API
 * @throws {Error} Throws timeout/cancellation errors or retry exhaustion errors
 * 
 * @example
 * const historyData = await fetchMarketHistoryWithRetry(url, limiter);
 * console.log(`Received ${historyData.length} history entries`);
 */
async function fetchMarketHistoryWithRetry(URL, limiter, attempt = 1) {
  try {
    const response = await fetchWithCustomHeaders(URL, { signal: limiter.getAbortSignal() });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();

    return data;
  } catch (err) {
    // Check if it's a timeout/cancellation error
    if (err.code === 'RATE_LIMITER_CANCELLED' || err.message === 'EXECUTION_TIMEOUT' || err.name === 'AbortError') {
      throw err; // Re-throw timeout errors to be handled by EventManager
    }
    
    if (attempt < MAX_API_RETRIES) {
      return await limiter.enqueue(
        fetchMarketHistoryWithRetry,
        URL,
        limiter,
        attempt + 1
      );
    }
    throw new Error(`Failed after ${MAX_API_RETRIES} retries: ${URL}`);
  }
}

/**
 * Processes successful market history requests and saves to database.
 * 
 * This function handles the post-processing of successful market history fetches:
 * - Filters historical data based on configured time periods
 * - Calculates market statistics (high/low prices, averages)
 * - Saves processed data to Firebase Realtime Database
 * - Returns database-ready object for further processing
 * 
 * @param {Object} result - Market history result object
 * @param {number} result.typeID - EVE Online type ID
 * @param {Object} result[locationName] - Market history data for each location
 * @returns {Promise<Object>} Database object containing processed market statistics
 * 
 * @example
 * const processedResult = await processRequestInfo({
 *   typeID: 34,
 *   Jita: []
 * });
 */
async function processRequestInfo(result) {
  const dbObject = { typeID: Number(result.typeID), lastUpdated: Date.now() };

  for (let location of DEFAULT_MARKET_LOCATIONS) {
    const locationData = result[location.name];

    const marketData = filterOldEntries(locationData);
    const { highestMarketPrice, lowestMarketPrice } =
      getHighestAndLowestMarketPrices(marketData);
    const {
      dailyAverageUnitCount,
      dailyAverageOrderQuantity,
      dailyAverageMarketPrice,
    } = getAverageMarketData(marketData);

    dbObject[location.name] = {
      highestMarketPrice,
      lowestMarketPrice,
      dailyAverageUnitCount,
      dailyAverageOrderQuantity,
      dailyAverageMarketPrice,
    };
  }
  await saveMarketHistoryToDatabase(result.typeID, dbObject);
  return dbObject;
}

/**
 * Filters market history data to remove entries older than configured period.
 * 
 * This function removes historical data that exceeds the configured time window:
 * - Calculates cutoff date based on DEFAULT_DAYS_FOR_MARKET_HISTORY
 * - Filters out entries older than the cutoff date
 * - Returns filtered array with recent data only
 * 
 * @param {Array<Object>} rawMarketData - Raw market history data from ESI API
 * @returns {Array<Object>} Filtered market history data within time window
 * 
 * @example
 * const filteredData = filterOldEntries(marketHistoryData);
 * console.log(`Filtered to ${filteredData.length} recent entries`);
 */
function filterOldEntries(rawMarketData) {
  const currentDate = Date.now();
  const chosenTimePeriod =
    currentDate - DEFAULT_DAYS_FOR_MARKET_HISTORY * 60 * 60 * 1000;

  return rawMarketData.filter((ob) => Date.parse(ob.date) <= chosenTimePeriod);
}

/**
 * Calculates the highest and lowest market prices from historical data.
 * 
 * This function extracts price extremes from market history data:
 * - Finds the maximum highest price across all entries
 * - Finds the minimum lowest price across all entries
 * - Returns 0 for empty datasets
 * 
 * @param {Array<Object>} marketData - Filtered market history data
 * @returns {Object} Object containing highest and lowest market prices
 * @returns {number} returns.highestMarketPrice - Highest market price found
 * @returns {number} returns.lowestMarketPrice - Lowest market price found
 * 
 * @example
 * const { highestMarketPrice, lowestMarketPrice } = getHighestAndLowestMarketPrices(marketData);
 * console.log(`Price range: ${lowestMarketPrice} - ${highestMarketPrice}`);
 */
function getHighestAndLowestMarketPrices(marketData) {
  const highestMarketPrice =
    marketData.length > 0 ? Math.max(...marketData.map((i) => i.highest)) : 0;

  const lowestMarketPrice =
    marketData.length > 0 ? Math.min(...marketData.map((i) => i.lowest)) : 0;

  return { highestMarketPrice, lowestMarketPrice };
}

/**
 * Calculates average market statistics from historical data.
 * 
 * This function computes daily averages for market metrics:
 * - Calculates average market price across all entries
 * - Computes average order count per day
 * - Determines average volume traded per day
 * - Handles empty datasets gracefully
 * - Rounds results to 2 decimal places for precision
 * 
 * @param {Array<Object>} marketData - Filtered market history data
 * @returns {Object} Object containing calculated average statistics
 * @returns {number} returns.dailyAverageMarketPrice - Average market price
 * @returns {number} returns.dailyAverageOrderQuantity - Average order count
 * @returns {number} returns.dailyAverageUnitCount - Average volume traded
 * 
 * @example
 * const averages = getAverageMarketData(marketData);
 * console.log(`Daily average price: ${averages.dailyAverageMarketPrice}`);
 */
function getAverageMarketData(marketData) {
  if (marketData.length === 0) {
    return {
      dailyAverageMarketPrice: 0,
      dailyAverageOrderQuantity: 0,
      dailyAverageUnitCount: 0,
    };
  }

  let sumAverage = 0;
  let sumOrderCount = 0;
  let sumVolume = 0;

  marketData.forEach((obj) => {
    sumAverage += obj.average;
    sumOrderCount += obj.order_count;
    sumVolume += obj.volume;
  });

  const dailyAverageMarketPrice =
    Math.round((sumAverage / marketData.length + Number.EPSILON) * 100) / 100;
  const dailyAverageOrderQuantity =
    Math.round((sumOrderCount / marketData.length + Number.EPSILON) * 100) /
    100;
  const dailyAverageUnitCount =
    Math.round((sumVolume / marketData.length + Number.EPSILON) * 100) / 100;

  return {
    dailyAverageMarketPrice,
    dailyAverageOrderQuantity,
    dailyAverageUnitCount,
  };
}

/**
 * Saves processed market history data to Firebase Realtime Database.
 * 
 * This function stores the calculated market statistics in the database:
 * - Saves data under the live-data/market-history path
 * - Uses typeID as the key for the data
 * - Handles database connection and error management
 * - Provides error logging for debugging
 * 
 * @param {number} typeID - EVE Online type ID for the market history data
 * @param {Object} dbObject - Processed market history object with statistics
 * @throws {Error} Throws error if database save operation fails
 * 
 * @example
 * await saveMarketHistoryToDatabase(34, {
 *   typeID: 34,
 *   lastUpdated: 1234567890,
 *   Jita: {
 *     highestMarketPrice: 15.5,
 *     lowestMarketPrice: 10.2,
 *     dailyAverageMarketPrice: 12.8
 *   }
 * });
 */
async function saveMarketHistoryToDatabase(typeID, dbObject) {
  const db = getDatabase();
  try {
    const path = db.ref(`live-data/market-history/${typeID.toString()}`);
    await path.set(dbObject);
  } catch (err) {
    error(err);
  }
}

export default ESIMarketHistoryQuery;
