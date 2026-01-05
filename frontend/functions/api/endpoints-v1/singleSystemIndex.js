import { getDatabase } from "firebase-admin/database";
import { error, log, warn } from "firebase-functions/logger";
import buildMissingSystemIndexValue from "../../sharedFunctions/misingSystemIndexValue.js";

/**
 * Retrieves system cost index for a single solar system.
 * 
 * This endpoint provides system cost index data for industry calculations:
 * - Fetches system cost index from Firebase Realtime Database
 * - Handles missing data by providing default values
 * - Returns comprehensive system index data for the requested system
 * - Validates system ID format and provides appropriate error responses
 * - Provides comprehensive logging and error handling
 * 
 * @param {Object} req - Express request object
 * @param {string} req.params.systemID - EVE Online solar system ID
 * @param {string} req.header.accountID - Account ID for logging
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Sends JSON response with system index data
 * 
 * @example
 * // Request: GET /system-indexes/30000142
 * 
 * // Response:
 * {
 *   "solar_system_id": 30000142,
 *   "manufacturing": 0.05,
 *   "researching_time_efficiency": 0.02,
 *   "researching_material_efficiency": 0.01,
 *   "copying": 0.03,
 *   "invention": 0.04,
 *   "reaction": 0.06,
 *   "lastUpdated": 1640995200000
 * }
 */
async function retrieveSystemIndex(req, res) {
  try {
    const db = getDatabase();
    const systemID = req.params.systemID;
    const accountID = req.header("accountID");

    if (!systemID || isNaN(Number(systemID))) {
      warn(`${accountID} - Invalid System ID provided in request`, {
        systemID: systemID || "Not Provided",
      });
      return res.status(400).send("Invalid System ID");
    }

    const systemRef = db.ref(`live-data/system-indexes/${systemID}`);
    const snapshot = await systemRef.get();
    const systemData = snapshot.val();

    if (!systemData) {
      warn(`No data found for system ID: ${systemID}`);
      const missingData = buildMissingSystemIndexValue(systemID);
      return res.status(200).json(missingData);
    }

    log(`${accountID} - System data retrieved for system ID: ${systemID}`);
    return res.status(200).json(systemData);
  } catch (err) {
    error("Error retrieving system index data", {
      message: err.message,
      stack: err.stack,
    });
    return res
      .status(500)
      .send("Error retrieving system data, please try again later.");
  }
}

export default retrieveSystemIndex;
