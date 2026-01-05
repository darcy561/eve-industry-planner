import { getDatabase } from "firebase-admin/database";
import { error, log, debug, warn } from "firebase-functions/logger";
import sendBatchToCloudTasks from "../../sharedFunctions/sendCloudTask.js";
import { DEFAULT_MARKET_LOCATIONS } from "../../global-config-functions.js";

/**
 * Retrieves market data for specified items from Firebase Realtime Database.
 * 
 * This endpoint provides comprehensive market data access:
 * - Fetches market prices and adjusted prices from Firebase Realtime Database
 * - Merges market price and adjusted price data for complete information
 * - Checks for missing locations and queues background processing
 * - Returns available data immediately with placeholders for missing items
 * - Queues missing data for background processing via Cloud Tasks
 * - Provides comprehensive error handling and logging
 * 
 * @param {Object} req - Express request object
 * @param {Array<number>} req.body.idArray - Array of EVE Online type IDs
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Sends JSON response with market data
 * 
 * @example
 * // Request body:
 * {
 *   "idArray": [34, 35, 36]
 * }
 * 
 * // Response:
 * [
 *   {
 *     "typeID": 34,
 *     "lastUpdated": 1640995200000,
 *     "jita": { "buy": 100, "sell": 105 },
 *     "adjustedPrice": 102.5,
 *     "status": "ready"
 *   },
 *   {
 *     "typeID": 35,
 *     "lastUpdated": null,
 *     "status": "processing",
 *     "message": "Data is being fetched and will be available shortly"
 *   }
 * ]
 */
async function marketData(req, res) {
  try {
    const db = getDatabase();

    const { idArray: requestedIDs } = req.body;
    if (
      !requestedIDs ||
      !Array.isArray(requestedIDs) ||
      requestedIDs.length === 0
    ) {
      return res.status(400).send("Invalid or empty ID array");
    }

    const marketPricePromises = requestedIDs.map((id) =>
      db.ref(`live-data/market-prices/${id}`).get()
    );

    const adjustedPricePromises = requestedIDs.map((id) =>
      db.ref(`live-data/adjusted-prices/${id}`).get()
    );

    const [marketPricesResults, adjustedPricesResults] =
      await Promise.all([
        Promise.allSettled(marketPricePromises),
        Promise.allSettled(adjustedPricePromises),
      ]);

    let { returnData: databaseResults, missingIDs } = mergeData(
      requestedIDs,
      marketPricesResults,
      adjustedPricesResults,
      true
    );

    //add a step here to check that each of the objects has the correct locations, if not add to missing and queue
    const malformattedIDs = checkForMissingLocations(databaseResults);

    debug(`Found ${malformattedIDs.length} malformatted IDs from the database`);

    missingIDs = [...new Set([...missingIDs, ...malformattedIDs])];

    // For missing data, send to background processing
    if (missingIDs.length > 0) {
      try {

        await sendBatchToCloudTasks(
          missingIDs,
          "refreshMarketData",
          "refreshMarketDataSubscriber"
        );
        debug(`Queued ${missingIDs.length} items for background market data processing`);
      } catch (err) {
        warn(`Failed to queue market data processing: ${err.message}`);
      }
    }

    // Create placeholder objects for missing items
    const missingDataResults = missingIDs.map(id => ({
      typeID: id,
      lastUpdated: null,
      status: 'processing',
      message: 'Data is being fetched and will be available shortly'
    }));

    // Return available data plus placeholders for missing items
    const finalResults = [...databaseResults, ...missingDataResults];

    log(
      `${databaseResults.length} market data items, ${missingDataResults.length} processing items returned for ${req.header(
        "accountID"
      )}, [${requestedIDs}]`
    );

    return res.status(200).json(finalResults);
  } catch (err) {
    error(err);
    return res
      .status(500)
      .send("Error retrieving market data, please try again.");
  }
}

/**
 * Merges market price and adjusted price data from database results.
 * 
 * @param {Array<number>} requestedIDs - Array of requested type IDs
 * @param {Array<Object>} marketPrices - Market price database results
 * @param {Array<Object>} adjustedPrices - Adjusted price database results
 * @param {boolean} fromDatabase - Whether data is from database (true) or API (false)
 * @returns {Object} Object containing merged data and missing IDs
 * @returns {Array<Object>} returns.returnData - Merged market data objects
 * @returns {Array<number>} returns.missingIDs - Array of missing type IDs
 */
function mergeData(
  requestedIDs,
  marketPrices,
  adjustedPrices,
  fromDatabase
) {
  const returnData = [];
  const missingIDs = [];

  requestedIDs.forEach((id, index) => {
    const priceResult = marketPrices[index];
    const adjustedResult = adjustedPrices[index];

    const marketPricesData = fromDatabase
      ? priceResult.value?.val()
      : marketPrices.find((i) => i.typeID === id);
    const adjustedPriceData = adjustedResult?.value?.val();

    if (!marketPricesData) {
      missingIDs.push(id);
      return;
    }

    const outputObject = {
      ...marketPricesData,
      adjustedPrice: adjustedPriceData?.adjusted_price || 0,
    };

    returnData.push(outputObject);
  });

  return { returnData, missingIDs };
}

/**
 * Checks for missing market locations in database results.
 * 
 * @param {Array<Object>} databaseResults - Array of market data objects
 * @returns {Array<number>} Array of type IDs with missing locations
 */
function checkForMissingLocations(databaseResults) {
  const missingLocations = [];
  databaseResults.forEach(result => {
    DEFAULT_MARKET_LOCATIONS.forEach(location => {
      if (!result[location.name]) {
        missingLocations.push(result.typeID);
      }
    });
  });
  return missingLocations;
}

export default marketData;
