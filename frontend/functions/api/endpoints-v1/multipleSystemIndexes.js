import { getDatabase } from "firebase-admin/database";
import { error, log } from "firebase-functions/logger";
import buildMissingSystemIndexValue from "../../sharedFunctions/misingSystemIndexValue.js";

/**
 * Retrieves system cost indices for multiple solar systems.
 * 
 * This endpoint provides system cost index data for industry calculations:
 * - Fetches system cost indices from Firebase Realtime Database
 * - Handles missing data by providing default values
 * - Returns comprehensive system index data for all requested systems
 * - Provides parallel database queries for efficient data retrieval
 * - Handles database errors gracefully with fallback values
 * - Provides comprehensive logging and error handling
 * 
 * @param {Object} req - Express request object
 * @param {Array<number>} req.body.idArray - Array of EVE Online solar system IDs
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Sends JSON response with system index data
 * 
 * @example
 * // Request body:
 * {
 *   "idArray": [30000142, 30002187, 30002510]
 * }
 * 
 * // Response:
 * [
 *   {
 *     "solar_system_id": 30000142,
 *     "manufacturing": 0.05,
 *     "researching_time_efficiency": 0.02,
 *     "lastUpdated": 1640995200000
 *   },
 *   {
 *     "solar_system_id": 30002187,
 *     "manufacturing": 0.03,
 *     "researching_time_efficiency": 0.01,
 *     "lastUpdated": 1640995200000
 *   }
 * ]
 */
async function retrieveMultipleSystemIndexes(req, res) {
  try {
    const db = getDatabase();

    const { idArray } = req.body;

    if (!idArray || !Array.isArray(idArray) || idArray.length === 0) {
      return res.status(400).send("Invalid or empty ID array");
    }

    const results = {};

    const databaseRequests = idArray.map((id) => {
      const systemRef = db.ref(`live-data/system-indexes/${id}`);
      return systemRef.get();
    });

    const databaseResponses = await Promise.allSettled(databaseRequests);

    databaseResponses.forEach((response, index) => {
      const id = idArray[index];
      if (response.status === "fulfilled") {
        const data = response.value.val();
        results[id] = data || buildMissingSystemIndexValue(id);
      } else {
        error(
          `Failed to retrieve system index for ID ${id}: ${response.reason}`
        );
        results[id] = buildMissingSystemIndexValue(id);
      }
    });

    const returnData = Object.values(results);

    log(
      `${returnData.length} System Indexes Returned for ${req.header(
        "accountID"
      )}, IDs: [${idArray}]`
    );

    return res.status(200).json(returnData);
  } catch (err) {
    error("Error retrieving multiple system indexes", { message: err.message });
    return res
      .status(500)
      .send("Error retrieving system data, please try again.");
  }
}

export default retrieveMultipleSystemIndexes;
