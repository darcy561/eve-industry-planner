import { onRequest } from "firebase-functions/v2/https";
import { log, error, warn, debug } from "firebase-functions/logger";
import ESIMarketQuery from "../sharedFunctions/fetchMarketPrices.js";
import {
  FIREBASE_SERVER_REGION,
  FIREBASE_SERVER_TIMEZONE,
  MAX_CLOUD_TASK_TIMEOUT_SECONDS,
  DEFAULT_API_MAX_SERVER_INSTANCES,
} from "../global-config-functions.js";
import sendBatchToCloudTasks from "../sharedFunctions/sendCloudTask.js";

/**
 * Firebase Cloud Function for refreshing market data from EVE Online ESI API.
 * 
 * This function handles batch processing of market data requests:
 * - Receives arrays of type IDs for market data fetching
 * - Calls ESI API to fetch current market prices
 * - Handles completed, failed, and incomplete requests
 * - Automatically retries incomplete requests via Cloud Tasks
 * - Provides comprehensive logging and error handling
 * 
 * The function is designed to be called by Cloud Tasks as part of the market data
 * refresh pipeline, processing batches of type IDs efficiently.
 * 
 * @function refreshMarketData
 * @param {Object} req - HTTP request object
 * @param {Array<number>} req.body - Array of EVE Online type IDs to fetch market data for
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
      error(`Invalid or empty Task received.`);
      res.status(400).send("Invalid batch payload.");
      return;
    }

    log(
      `market data task recieved containing ${JSON.stringify(req.body)} items`
    );

    try {
      const results = await ESIMarketQuery(
        req.body,
        MAX_CLOUD_TASK_TIMEOUT_SECONDS
      );

      // Debug: Log the exact results received
      log(
        `ESIMarketQuery returned - completed: ${
          results.completed?.length || 0
        }, failed: ${results.failed?.length || 0}, incomplete: ${
          results.incomplete?.length || 0
        }`
      );

      // Log failed tasks
      if (results.failed && results.failed.length > 0) {
        error(
          `Market data task failed for ${results.failed.length} items:`,
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
            "refreshMarketData",
            "refreshMarketDataSubscriber"
          );
          log(`Successfully created new task for incomplete items`);
        } catch (taskError) {
          error(
            `Failed to create new task for incomplete items: ${taskError.message}`
          );
        }
      }

      // Enhanced debugging information
      const totalProcessed =
        (results.completed?.length || 0) +
        (results.failed?.length || 0) +
        (results.incomplete?.length || 0);
      debug(
        `Detailed breakdown - Total processed: ${totalProcessed}, Original batch size: ${req.body.length}`
      );

      if (totalProcessed !== req.body.length) {
        warn(
          `Task count mismatch: expected ${req.body.length}, got ${totalProcessed}`
        );
      }
      res.status(200).send("Batch processed successfully");
      return null;
    } catch (err) {
      error(`Unexpected error: ${err.message}`);
      res.status(500).send("Internal Server Error");
      return null;
    }
  }
);
