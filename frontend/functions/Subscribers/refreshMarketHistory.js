import { onRequest } from "firebase-functions/v2/https";
import { log, error, warn, debug } from "firebase-functions/logger";
import {
  FIREBASE_SERVER_REGION,
  FIREBASE_SERVER_TIMEZONE,
  MAX_CLOUD_TASK_TIMEOUT_SECONDS,
  DEFAULT_API_MAX_SERVER_INSTANCES,
} from "../global-config-functions.js";
import ESIMarketHistoryQuery from "../sharedFunctions/fetchMarketHistory.js";
import sendBatchToCloudTasks from "../sharedFunctions/sendCloudTask.js";

/**
 * Firebase Cloud Function for refreshing market history data from EVE Online ESI API.
 * 
 * This function handles batch processing of market history requests:
 * - Receives arrays of type IDs for market history fetching
 * - Calls ESI API to fetch historical market data
 * - Handles completed, failed, and incomplete requests
 * - Automatically retries incomplete requests via Cloud Tasks
 * - Provides comprehensive logging and error handling
 * 
 * The function is designed to be called by Cloud Tasks as part of the market history
 * refresh pipeline, processing batches of type IDs efficiently.
 * 
 * @function refreshMarketHistory
 * @param {Object} req - HTTP request object
 * @param {Array<number>} req.body - Array of EVE Online type IDs to fetch market history for
 * @param {Object} res - HTTP response object
 * 
 * @example
 * // Request body structure:
 * [34, 35, 36, 37, 38] // Array of type IDs
 */
export default onRequest(
  {
    region: FIREBASE_SERVER_REGION,
    timeZone: FIREBASE_SERVER_TIMEZONE,
    timeoutSeconds: MAX_CLOUD_TASK_TIMEOUT_SECONDS,
    concurrency: DEFAULT_API_MAX_SERVER_INSTANCES,
    maxInstances: DEFAULT_API_MAX_SERVER_INSTANCES,
  },
  async (req, res) => {
    if (!req.body || !Array.isArray(req.body)) {
      error(`Invalid or empty batch received.`);
      res.status(400).send("Invalid batch payload.");
      return;
    }

    log(
      `market history task recieved containing ${JSON.stringify(
        req.body
      )} items`
    );

    try {
      const results = await ESIMarketHistoryQuery(
        req.body,
        MAX_CLOUD_TASK_TIMEOUT_SECONDS
      );

      // Log failed tasks
      if (results.failed && results.failed.length > 0) {
        error(
          `Market history task failed for ${results.failed.length} items:`,
          results.failed
        );
      }

      // Handle incomplete tasks by creating a new task
      if (results.incomplete && results.incomplete.length > 0) {
        log(
          `Creating new task for ${results.incomplete.length} incomplete items: ${results.incomplete}`
        );

        try {
          await sendBatchToCloudTasks(
            results.incomplete,
            "refreshMarketHistory",
            "refreshMarketHistorySubscriber"
          );
          log(`Successfully created new task for incomplete items`);
        } catch (taskError) {
          error(
            `Failed to create new task for incomplete items: ${taskError.message}`
          );
        }
      }

      debug(
        `market history task complete - Completed: ${
          results.completed?.length || 0
        }, Failed: ${results.failed?.length || 0}, Incomplete: ${
          results.incomplete?.length || 0
        }`
      );
      res.status(200).send("Batch processed successfully");
      return null;
    } catch (err) {
      error(`Unexpected error: ${err.message}`);
      res.status(500).send("Internal Server Error");
      return null;
    }
  }
);
