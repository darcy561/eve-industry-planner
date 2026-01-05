import { onSchedule } from "firebase-functions/v2/scheduler";
import ESIItemAdjustedPriceQuery from "../sharedFunctions/fetchAdjustedPrices.js";
import {
  FIREBASE_SERVER_REGION,
  FIREBASE_SERVER_TIMEZONE,
} from "../global-config-functions.js";
import checkEveSeverStatus from "../sharedFunctions/eveServerStatus.js";
import { error, log, warn } from "firebase-functions/logger";

/**
 * Scheduled Firebase Cloud Function for refreshing EVE Online adjusted prices.
 * 
 * This function runs daily at 1:00 PM UTC to update adjusted market prices:
 * - Checks EVE Online server status before proceeding
 * - Fetches latest adjusted prices from ESI API
 * - Processes and stores price data in Firebase Realtime Database
 * - Provides comprehensive error handling and logging
 * 
 * Schedule: Daily at 1:00 PM UTC (0 13 * * *)
 * Timeout: 9 minutes (540 seconds)
 * 
 * @function refreshAdjustedPrices
 * @param {Object} event - Scheduled event object from Firebase Scheduler
 * @returns {Promise<null>} Always returns null
 * 
 * @example
 * // Function runs automatically via Firebase Scheduler
 * // No manual invocation required
 */
export default onSchedule(
  {
    schedule: "0 13 * * *",
    region: FIREBASE_SERVER_REGION,
    timeZone: FIREBASE_SERVER_TIMEZONE,
    timeoutSeconds: 540,
  },
  async (event) => {
    try {
      const serverStatus = await checkEveSeverStatus(null);
      if (!serverStatus) {
        return null;
      }

      await ESIItemAdjustedPriceQuery();

      log("Adjusted Prices Updated");
      return null;
    } catch (err) {
      error(`An error occurred: ${err.stack || err}`);
      return null;
    }
  }
);
