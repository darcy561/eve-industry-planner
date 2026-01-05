import { error } from "firebase-functions/logger";
import { getDatabase } from "firebase-admin/database";
import fetchWithCustomHeaders from "../util/fetchWithHeaders.js";

/**
 * Main function for querying EVE Online ESI adjusted prices.
 * 
 * This function orchestrates the fetching and processing of adjusted market prices:
 * - Fetches adjusted prices from EVE Online ESI API
 * - Transforms raw API data into database-ready format
 * - Saves processed data to Firebase Realtime Database
 * - Provides comprehensive error handling and logging
 * 
 * @returns {Promise<Object>} Database object containing adjusted prices by type ID
 * @throws {Error} Throws error if any step in the process fails
 * 
 * @example
 * const adjustedPrices = await ESIItemAdjustedPriceQuery();
 * console.log(`Fetched prices for ${Object.keys(adjustedPrices).length} items`);
 */
async function ESIItemAdjustedPriceQuery() {
  try {
    const responseData = await fetchAdjustedPrices();

    const databaseObject = buildDatabaseObject(responseData);

    await saveAdjustedPriceToDatabase(databaseObject);

    return databaseObject;
  } catch (err) {
    error(`An error occurred: ${err.stack || err}`);
    throw err;
  }
}

/**
 * Fetches adjusted prices from EVE Online ESI API.
 * 
 * This function makes a direct API call to the EVE Online adjusted prices endpoint:
 * - Calls the ESI markets/prices endpoint
 * - Handles HTTP response validation
 * - Returns raw JSON data from the API
 * - Provides error handling for network issues
 * 
 * @returns {Promise<Array<Object>>} Array of adjusted price objects from ESI API
 * @throws {Error} Throws error if API request fails
 * 
 * @example
 * const prices = await fetchAdjustedPrices();
 * console.log(`Received ${prices.length} price entries`);
 */
async function fetchAdjustedPrices() {
  try {
    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/v1/markets/prices/`
    );

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    error(`Failed to fetch prices: ${err.message}`);
    throw err;
  }
}

/**
 * Transforms raw API data into a database-ready object structure.
 * 
 * This function converts the array format from ESI API into a hash object:
 * - Creates a hash object using type_id as keys
 * - Improves database query performance
 * - Maintains all original price data properties
 * 
 * @param {Array<Object>} initialArray - Array of price objects from ESI API
 * @returns {Object} Hash object with type_id as keys and price data as values
 * 
 * @example
 * const dbObject = buildDatabaseObject([
 *   { type_id: 34, adjusted_price: 10.5 },
 *   { type_id: 35, adjusted_price: 15.2 }
 * ]);
 * console.log(dbObject[34].adjusted_price); // 10.5
 */
function buildDatabaseObject(initialArray) {
  const hashObject = {};

  for (let i = 0; i < initialArray.length; i++) {
    const item = initialArray[i];

    hashObject[item.type_id] = item;
  }

  return hashObject;
}

/**
 * Saves adjusted price data to Firebase Realtime Database.
 * 
 * This function stores the processed adjusted prices in the database:
 * - Saves data under the live-data/adjusted-prices path
 * - Handles database connection and error management
 * - Provides error logging for debugging
 * 
 * @param {Object} databaseObject - Hash object containing adjusted prices by type ID
 * @throws {Error} Throws error if database save operation fails
 * 
 * @example
 * await saveAdjustedPriceToDatabase({
 *   34: { type_id: 34, adjusted_price: 10.5 },
 *   35: { type_id: 35, adjusted_price: 15.2 }
 * });
 */
async function saveAdjustedPriceToDatabase(databaseObject) {
  try {
    const db = getDatabase();

    await db.ref(`live-data/adjusted-prices`).set(databaseObject);
  } catch (err) {
    error(`An error occurred: ${err.stack || err}`);
    throw new Error(err.message);
  }
}

export default ESIItemAdjustedPriceQuery;
