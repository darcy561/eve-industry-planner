import { CloudTasksClient } from "@google-cloud/tasks";
import { getApp } from "firebase-admin/app";
import { FIREBASE_SERVER_REGION } from "../global-config-functions.js";
import { error, debug } from "firebase-functions/logger";

/**
 * Sends data to a Google Cloud Task for asynchronous processing.
 * 
 * This function creates and queues Cloud Tasks for background processing:
 * - Validates input data to prevent null/undefined submissions
 * - Creates HTTP POST requests to Firebase Cloud Functions
 * - Configures OIDC authentication for secure function calls
 * - Schedules tasks with a 10-second delay for immediate processing
 * - Provides comprehensive logging for debugging and monitoring
 * - Handles both single objects and arrays of data
 * 
 * @param {any} batch - The data to be sent to the Cloud Task (any type)
 * @param {string} queue - The name of the Cloud Tasks queue
 * @param {string} subscriberFunctionName - The name of the subscriber function
 * @returns {Promise<void>} Promise that resolves when task is created
 * 
 * @example
 * // Send a single object
 * await sendBatchToCloudTasks({ typeID: 34 }, "marketDataProcessing", "marketDataProcessingSubscriber");
 * 
 * // Send an array of type IDs
 * await sendBatchToCloudTasks([34, 35, 36], "refreshMarketData", "refreshMarketDataSubscriber");
 */
async function sendBatchToCloudTasks(batch, queue, subscriberFunctionName) {
  if (batch === null || batch === undefined) {
    error(`Invalid batch data: null or undefined`);
    return;
  }

  const projectId = getApp().options.projectId;
  const client = new CloudTasksClient();
  const taskPayload = JSON.stringify(batch);

  const task = {
    httpRequest: {
      httpMethod: "POST",
      url: `https://${FIREBASE_SERVER_REGION}-${projectId}.cloudfunctions.net/${subscriberFunctionName}`,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(taskPayload),
      oidcToken: {
        serviceAccountEmail: `${projectId}@appspot.gserviceaccount.com`,
      },
    },
    scheduleTime: {
      seconds: Date.now() / 1000 + 10,
    },
  };

  const queuePath = client.queuePath(projectId, FIREBASE_SERVER_REGION, queue);

  try {
    const [response] = await client.createTask({ parent: queuePath, task });
    const itemCount = Array.isArray(batch) ? batch.length : 1;
    const dataType = Array.isArray(batch) ? 'array' : typeof batch;
    debug(`Task created: ${response.name} with ${itemCount} item(s) (${dataType}).`);
  } catch (err) {
    error(`Failed to create task for batch: ${err}`);
  }
}

export default sendBatchToCloudTasks; 