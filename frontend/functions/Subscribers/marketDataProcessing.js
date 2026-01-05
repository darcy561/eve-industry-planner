import { onRequest } from "firebase-functions/v2/https";
import { error, debug } from "firebase-functions/logger";
import {
    FIREBASE_SERVER_REGION,
    FIREBASE_SERVER_TIMEZONE,
    DEFAULT_MARKET_LOCATIONS,
} from "../global-config-functions.js";
import { getDatabase } from "firebase-admin/database";

/**
 * Firebase Cloud Function for processing market data from EVE Online ESI API.
 * 
 * This function processes market order data and extracts buy/sell prices:
 * - Receives market data for specific type IDs from ESI API
 * - Filters orders by location and order type (buy/sell)
 * - Calculates highest buy and lowest sell prices
 * - Stores processed market data in Firebase Realtime Database
 * - Handles multiple market locations simultaneously
 * 
 * The function is designed to be called by Cloud Tasks as part of the market data
 * refresh pipeline, processing individual type ID market data efficiently.
 * 
 * @function marketDataProcessing
 * @param {Object} req - HTTP request object
 * @param {Object} req.body - Market data object containing typeID and location data
 * @param {number} req.body.typeID - EVE Online type ID for the market data
 * @param {Object} req.body[locationName] - Market data for each location
 * @param {Array<Object>} req.body[locationName] - Array of market orders
 * @param {Object} res - HTTP response object
 * 
 * @example
 * // Request body structure:
 * {
 *   typeID: 34,
 *   "Jita": [
 *     { location_id: 60003760, is_buy_order: true, price: 10.5 },
 *     { location_id: 60003760, is_buy_order: false, price: 11.0 }
 *   ]
 * }
 */
export default onRequest(
    {
        region: FIREBASE_SERVER_REGION,
        timeZone: FIREBASE_SERVER_TIMEZONE,
        timeoutSeconds: 60,
        concurrency: 80,
        maxInstances: 80,
        memory: "128MB",
    },
    async (req, res) => {
        if (!req.body || typeof req.body !== 'object') {
            error(`Invalid or empty Task received.`);
            res.status(400).send("Invalid batch payload.");
            return;
        }
        try {
            const db = getDatabase();
            const results = req.body;

            debug(`marketDataProcessing: Received market data for typeID ${results.typeID}`);
            debug(`marketDataProcessing: Full results object:`, JSON.stringify(results, null, 2));

            const dbObject = {
                typeID: Number(results.typeID),
                lastUpdated: Date.now(),
            };

            for (const location of DEFAULT_MARKET_LOCATIONS) {
                const locationData = results[location.name];
                if (!locationData) {
                    continue;
                }
                const { buyOrders, sellOrders } = filterOrders(locationData, location.stationID);
                const { highestBuyPrice, lowestSellPrice } = getHighestBuyAndLowestSellPrices(buyOrders, sellOrders);
                dbObject[location.name] = {
                    buy: highestBuyPrice,
                    sell: lowestSellPrice,
                };
            }

            debug(`marketDataProcessing: Final dbObject to save:`, JSON.stringify(dbObject, null, 2));
            await saveMarketPricesToDatabase(results.typeID, dbObject, db);

            debug(`marketDataProcessing: Successfully saved market data for typeID ${results.typeID}`);

            res.status(200).send("Market prices processed successfully");
        } catch (err) {
            error(`Unexpected error: ${err.message}`);
            res.status(500).send("Internal server error");
        }
    }
);

/**
 * Filters market orders by location and order type.
 * 
 * This function separates buy and sell orders for a specific station:
 * - Filters orders by location_id matching the station ID
 * - Separates orders into buy and sell arrays based on is_buy_order flag
 * - Returns organized order data for price calculation
 * 
 * @param {Array<Object>} orders - Array of market order objects
 * @param {number} stationID - Station ID to filter orders by
 * @returns {Object} Object containing filtered buy and sell orders
 * @returns {Array<Object>} returns.buyOrders - Array of buy orders for the station
 * @returns {Array<Object>} returns.sellOrders - Array of sell orders for the station
 * 
 * @example
 * const { buyOrders, sellOrders } = filterOrders(marketOrders, 60003760);
 */
function filterOrders(orders, stationID) {
    const buyOrders = [];
    const sellOrders = [];

    for (let order of orders) {
        if (order.location_id === stationID) {
            if (order.is_buy_order) {
                buyOrders.push(order);
            } else {
                sellOrders.push(order);
            }
        }
    }
    return { buyOrders, sellOrders };
}


/**
 * Calculates the highest buy price and lowest sell price from order arrays.
 * 
 * This function extracts the best market prices from filtered orders:
 * - Finds the maximum price from buy orders (highest buy price)
 * - Finds the minimum price from sell orders (lowest sell price)
 * - Returns 0 for empty order arrays
 * 
 * @param {Array<Object>} buyOrders - Array of buy order objects
 * @param {Array<Object>} sellOrders - Array of sell order objects
 * @returns {Object} Object containing calculated prices
 * @returns {number} returns.highestBuyPrice - Highest buy order price
 * @returns {number} returns.lowestSellPrice - Lowest sell order price
 * 
 * @example
 * const { highestBuyPrice, lowestSellPrice } = getHighestBuyAndLowestSellPrices(buyOrders, sellOrders);
 */
function getHighestBuyAndLowestSellPrices(buyOrders, sellOrders) {
    const highestBuyPrice =
        buyOrders.length > 0 ? Math.max(...buyOrders.map((o) => o.price)) : 0;
    const lowestSellPrice =
        sellOrders.length > 0 ? Math.min(...sellOrders.map((o) => o.price)) : 0;
    return { highestBuyPrice, lowestSellPrice };
}


/**
 * Saves processed market prices to Firebase Realtime Database.
 * 
 * This function stores market price data in the database:
 * - Saves market prices under the live-data/market-prices path
 * - Uses typeID as the key for the data
 * - Handles database errors and re-throws them for upstream handling
 * - Logs successful saves and errors for debugging
 * 
 * @param {number} typeID - EVE Online type ID for the market data
 * @param {Object} marketPrices - Processed market price object
 * @param {Object} selectedDatabase - Firebase Realtime Database instance
 * @throws {Error} Throws error if database save fails
 * 
 * @example
 * await saveMarketPricesToDatabase(34, { buy: 10.5, sell: 11.0 }, db);
 */
async function saveMarketPricesToDatabase(
    typeID,
    marketPrices,
    selectedDatabase
) {
    try {
        await selectedDatabase
            .ref(`live-data/market-prices/${typeID.toString()}`)
            .set(marketPrices);
        debug(`saveMarketPricesToDatabase: Successfully saved to database for typeID ${typeID}`);
    } catch (err) {
        error(`Failed to save market prices to database: ${err.message}`);
        throw err; // Re-throw to be handled by the main try-catch
    }
}