import { onSchedule } from "firebase-functions/scheduler";
import {
  FIREBASE_SERVER_REGION,
  FIREBASE_SERVER_TIMEZONE,
  DEFAULT_ITEM_HISTROY_REFRESH_PERIOD,
  DEFAULT_ITEM_MARKET_HISTORY_REFRESH_QUANTITY,
} from "../global-config-functions.js";
import { getDatabase } from "firebase-admin/database";
import { error, log, warn } from "firebase-functions/logger";
import checkEveSeverStatus from "../sharedFunctions/eveServerStatus.js";
import sendBatchToCloudTasks from "../sharedFunctions/sendCloudTask.js";
import { getTraceId } from "../sharedFunctions/traceHelper.js";

const MARKET_PRICES_REF = "live-data/market-history";
const queue = "refreshMarketHistory";
const subscriberFunctionName = "refreshMarketHistorySubscriber";
const TIME_LIMIT = DEFAULT_ITEM_HISTROY_REFRESH_PERIOD * 60 * 60 * 1000;

/**
 * Scheduled Firebase Cloud Function for publishing market history refresh tasks.
 * 
 * This function runs every hour to identify stale market history data and dispatch refresh tasks:
 * - Queries Firebase Realtime Database for market history older than configured threshold
 * - Checks EVE Online server status before proceeding
 * - Batches type IDs into Cloud Tasks for efficient processing
 * - Dispatches tasks to refreshMarketHistorySubscriber for actual data fetching
 * - Provides comprehensive logging and error handling
 * 
 * Schedule: Every hour
 * Timeout: Default (60 seconds)
 * 
 * @function refreshMarketHistory
 * @param {Object} event - Scheduled event object from Firebase Scheduler
 * @returns {Promise<null>} Always returns null
 * 
 * @example
 * // Function runs automatically via Firebase Scheduler
 * // Publishes market history refresh tasks to Cloud Tasks
 */
export default onSchedule(
  {
    schedule: "every 1 hours",
    region: FIREBASE_SERVER_REGION,
    timeZone: FIREBASE_SERVER_TIMEZONE,
  },
  async (event) => {
    try {
      const db = getDatabase();

      const pricingSnapshot = await db
        .ref(MARKET_PRICES_REF)
        .orderByChild("lastUpdated")
        .endAt(Date.now() - TIME_LIMIT)
        .once("value");

      const pricingData = pricingSnapshot.val();

      if (!pricingData || Object.keys(pricingData).length === 0) {
        log("no market history items found to refresh");
        return null;
      }

      // Get trace ID for scheduled function
      const traceId = getTraceId(event);

      const serverStatus = await checkEveSeverStatus(traceId);
      if (!serverStatus) {
        warn("eve servers offline - unable to refresh market history");
        return null;
      }

      const allTypeIDs = Object.keys(pricingData);

      let numberOfMessagesSent = 0;
      for (
        let i = 0;
        i < allTypeIDs.length;
        i += DEFAULT_ITEM_MARKET_HISTORY_REFRESH_QUANTITY
      ) {
        const payload = allTypeIDs.slice(
          i,
          i + DEFAULT_ITEM_MARKET_HISTORY_REFRESH_QUANTITY
        );
        await sendBatchToCloudTasks(payload, queue, subscriberFunctionName);
        numberOfMessagesSent ++
      }

      log(`dispatched ${allTypeIDs.length} items, ${numberOfMessagesSent} messages sent`);

      return null;
    } catch (err) {
      error(`An error occurred: ${err.message}`);
      return null;
    }
  }
);
