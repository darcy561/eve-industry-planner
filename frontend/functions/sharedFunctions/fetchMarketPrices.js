import { error, debug } from "firebase-functions/logger";
import {
  DEFAULT_MARKET_LOCATIONS,
  MAX_API_RETRIES,
} from "../global-config-functions.js";
import EventManager from "../Classes/eventManager.js";
import fetchWithCustomHeaders from "../util/fetchWithHeaders.js";
import sendBatchToCloudTasks from "./sendCloudTask.js";

/**
 * Main function for querying EVE Online ESI market data.
 * 
 * This function orchestrates the fetching of market order data from EVE Online's ESI API:
 * - Processes arrays of type IDs for market data fetching
 * - Uses EventManager for concurrent processing with rate limiting
 * - Fetches market orders from multiple regions simultaneously
 * - Handles pagination for large datasets
 * - Implements retry logic for failed requests
 * - Sends processed data to Cloud Tasks for further processing
 * 
 * @param {Array<number>|number} typeIDs - EVE Online type ID(s) to fetch market data for
 * @param {number} [maxRunTimeSeconds=0] - Maximum runtime in seconds (0 = no limit)
 * @returns {Promise<Object>} Results object with completed, failed, and incomplete arrays
 * 
 * @example
 * // Fetch market data for multiple type IDs
 * const results = await ESIMarketQuery([34, 35, 36], 300);
 * console.log(`Completed: ${results.completed.length}, Failed: ${results.failed.length}`);
 */
async function ESIMarketQuery(typeIDs = [], maxRunTimeSeconds = 0) {
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
 * Fetches market data for a single type ID across all configured locations.
 * 
 * This function coordinates the fetching of market orders for a specific type ID:
 * - Creates promises for each market location
 * - Fetches paginated data from each region
 * - Handles errors and timeouts appropriately
 * - Returns structured data object with location-specific results
 * 
 * @param {number} typeID - EVE Online type ID to fetch market data for
 * @param {Object} limiter - Rate limiter instance for controlling API requests
 * @returns {Promise<Object>} Object containing typeID and location-specific market data
 * @throws {Error} Throws timeout/cancellation errors for EventManager handling
 * 
 * @example
 * const result = await fetchTypeID(34, limiter);
 * console.log(result.typeID); // 34
 * console.log(result.Jita); // Array of market orders for Jita
 */
async function fetchTypeID(typeID, limiter) {
  const locationPromises = [];
  const resultsObj = { typeID };

  for (let location of DEFAULT_MARKET_LOCATIONS) {
    locationPromises.push(fetchPaginatedData(typeID, location, limiter));
    resultsObj[location.name] = null;
  }

  const results = await Promise.all(locationPromises);

  for (let result of results) {
    if (result instanceof Error) {
      // Check if it's a timeout/cancellation error
      if (result.code === 'RATE_LIMITER_CANCELLED' || result.message === 'EXECUTION_TIMEOUT' || result.name === 'AbortError') {
        throw result; // Re-throw timeout errors to be handled by EventManager
      }
      continue // Skip non-timeout errors
    }
    resultsObj[result.id] = result.data;
  }

  return resultsObj;
}

/**
 * Fetches paginated market data for a specific type ID and location.
 * 
 * This function handles pagination for market order data:
 * - Makes multiple API requests to get all pages of data
 * - Combines data from all pages into a single array
 * - Handles rate limiting and retry logic
 * - Returns structured data with location identifier
 * 
 * @param {number} typeID - EVE Online type ID to fetch market data for
 * @param {Object} location - Location configuration object
 * @param {string} location.name - Location name (e.g., "Jita")
 * @param {number} location.regionID - EVE Online region ID
 * @param {Object} limiter - Rate limiter instance for controlling API requests
 * @returns {Promise<Object>} Object containing location name and market data array
 * @throws {Error} Throws timeout/cancellation errors for EventManager handling
 * 
 * @example
 * const result = await fetchPaginatedData(34, { name: "Jita", regionID: 10000002 }, limiter);
 * console.log(result.id); // "Jita"
 * console.log(result.data); // Array of market orders
 */
async function fetchPaginatedData(typeID, location, limiter) {
  const { name, regionID } = location;
  let combinedData = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const URL = `https://esi.evetech.net/v1/markets/${regionID}/orders/?datasource=tranquility&order_type=all&page=${page}&type_id=${typeID}`;
    try {
      const { data, headers } = await limiter.enqueue(
        fetchRegionDataWithRetry,
        URL,
        limiter
      );

      combinedData = combinedData.concat(data);

      const totalPagesFromHeader = parseInt(headers.get("x-total-pages"), 10);
      totalPages = totalPagesFromHeader || 1;

      page++;
    } catch (err) {
      // Check if it's a timeout/cancellation error
      if (err.code === 'RATE_LIMITER_CANCELLED' || err.message === 'EXECUTION_TIMEOUT') {
        throw err; // Re-throw timeout errors to be handled by EventManager
      }
      return { id: name, data: [] } // Return empty data for non-timeout errors
    }
  }
  return { id: name, data: combinedData };
}

/**
 * Fetches market data from ESI API with retry logic.
 * 
 * This function implements robust API request handling:
 * - Makes HTTP requests to EVE Online ESI API
 * - Handles rate limiting and abort signals
 * - Implements exponential backoff retry logic
 * - Distinguishes between timeout and other errors
 * - Returns structured response data
 * 
 * @param {string} URL - Complete ESI API URL for market data
 * @param {Object} limiter - Rate limiter instance for controlling API requests
 * @param {number} [attempt=1] - Current attempt number for retry logic
 * @returns {Promise<Object>} Object containing response data and headers
 * @throws {Error} Throws timeout/cancellation errors or retry exhaustion errors
 * 
 * @example
 * const { data, headers } = await fetchRegionDataWithRetry(url, limiter);
 * console.log(`Total pages: ${headers.get('x-total-pages')}`);
 */
async function fetchRegionDataWithRetry(URL, limiter, attempt = 1) {
  try {
    const response = await fetchWithCustomHeaders(URL, { signal: limiter.getAbortSignal() });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    return { data, headers: response.headers };
  } catch (err) {
    // Check if it's a timeout/cancellation error
    if (err.code === 'RATE_LIMITER_CANCELLED' || err.message === 'EXECUTION_TIMEOUT' || err.name === 'AbortError') {
      throw err; // Re-throw timeout errors to be handled by EventManager
    }

    if (attempt < MAX_API_RETRIES) {
      return await limiter.enqueue(
        fetchRegionDataWithRetry,
        URL,
        limiter,
        attempt + 1
      );
    }
    throw new Error(`Failed after ${MAX_API_RETRIES} retries: ${URL}`);
  }
}

/**
 * Processes successful market data requests by sending them to Cloud Tasks.
 * 
 * This function handles the post-processing of successful market data fetches:
 * - Sends processed market data to Cloud Tasks for further processing
 * - Logs successful operations for debugging
 * - Handles and re-throws errors for EventManager processing
 * - Integrates with the market data processing pipeline
 * 
 * @param {Object} result - Market data result object
 * @param {number} result.typeID - EVE Online type ID
 * @param {Object} result[locationName] - Market data for each location
 * @returns {Promise<Object>} The original result object
 * @throws {Error} Throws error if Cloud Tasks operation fails
 * 
 * @example
 * const processedResult = await processRequestInfo({
 *   typeID: 34,
 *   Jita: []
 * });
 */
async function processRequestInfo(result) {
  try {
    debug(`processRequestInfo: Sending market data for typeID ${result.typeID} to marketDataProcessingSubscriber`);
    await sendBatchToCloudTasks(result,
      "marketDataProcessing",
      "marketDataProcessingSubscriber"
    );
    debug(`processRequestInfo: Successfully sent market data for typeID ${result.typeID}`);
    return result;
  } catch (err) {
    error(`Failed to send market data to Cloud Tasks: ${err.message}`);
    throw err; // Re-throw the error so it can be handled by the EventManager
  }
}

export default ESIMarketQuery;
