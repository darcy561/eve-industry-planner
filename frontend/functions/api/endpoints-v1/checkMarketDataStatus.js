import { getDatabase } from "firebase-admin/database";
import { error, log } from "firebase-functions/logger";

/**
 * Checks the status of market data for specified items.
 * 
 * This endpoint provides market data availability status:
 * - Checks Firebase Realtime Database for market price data existence
 * - Returns availability status and last updated timestamps
 * - Provides status information for each requested item
 * - Handles missing data gracefully
 * - Provides comprehensive error handling and logging
 * 
 * @param {Object} req - Express request object
 * @param {Array<number>} req.body.idArray - Array of EVE Online type IDs
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Sends JSON response with status information
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
 *     "available": true,
 *     "lastUpdated": 1640995200000,
 *     "status": "ready"
 *   },
 *   {
 *     "typeID": 35,
 *     "available": false,
 *     "lastUpdated": null,
 *     "status": "processing"
 *   }
 * ]
 */
async function checkMarketDataStatus(req, res) {
  try {
    const db = getDatabase();
    const { idArray: requestedIDs } = req.body;
    
    if (!requestedIDs || !Array.isArray(requestedIDs) || requestedIDs.length === 0) {
      return res.status(400).send("Invalid or empty ID array");
    }

    const marketPricePromises = requestedIDs.map((id) =>
      db.ref(`live-data/market-prices/${id}`).get()
    );

    const marketPricesResults = await Promise.allSettled(marketPricePromises);
    
    const statusResults = requestedIDs.map((id, index) => {
      const priceResult = marketPricesResults[index];
      const data = priceResult.value?.val();
      
      return {
        typeID: id,
        available: !!data,
        lastUpdated: data?.lastUpdated || null,
        status: data ? 'ready' : 'processing'
      };
    });

    return res.status(200).json(statusResults);
  } catch (err) {
    error(err);
    return res.status(500).send("Error checking market data status");
  }
}

export default checkMarketDataStatus;
