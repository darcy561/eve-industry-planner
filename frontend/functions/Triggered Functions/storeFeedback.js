import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import admin from "firebase-admin";
import { WebhookClient, EmbedBuilder } from "discord.js";
import crypto from "crypto";
import { FIREBASE_SERVER_REGION } from "../global-config-functions.js";
import { error, log } from "firebase-functions/logger";

/**
 * Secret parameter for Discord webhook URL used for feedback notifications.
 * 
 * This secret contains the Discord webhook URL where feedback messages
 * will be sent for developer notification and tracking.
 * 
 * @type {import("firebase-functions/params").SecretParam}
 */
const FEEDBACKURL = defineSecret("FEEDBACKURL");

/**
 * Firebase Storage bucket instance for storing feedback data.
 * 
 * This bucket is used to store ESI data attachments that users
 * may include with their feedback submissions for debugging purposes.
 * 
 * @type {import("firebase-admin").storage.Bucket}
 */
const bucket = admin.storage().bucket();

/**
 * Firebase Cloud Function that processes user feedback submissions and stores them securely.
 * 
 * This function handles comprehensive feedback processing for the EVE Industry Planner:
 * - Validates App Check authentication for security
 * - Stores optional ESI data attachments in Firebase Storage
 * - Sends formatted feedback notifications to Discord webhook
 * - Generates unique file IDs for data tracking
 * - Provides comprehensive error handling and logging
 * 
 * The feedback processing workflow:
 * 1. Validates App Check authentication and required data
 * 2. Generates unique file ID for tracking purposes
 * 3. Stores ESI data in Firebase Storage if provided
 * 4. Creates Discord webhook client with secret URL
 * 5. Builds rich embed message with feedback details
 * 6. Sends notification to Discord webhook
 * 7. Waits for storage operation completion
 * 8. Returns success confirmation
 * 
 * Security features:
 * - App Check enforcement for request verification
 * - Secret management for Discord webhook URL
 * - Secure file storage with unique identifiers
 * - Input validation and error handling
 * - Comprehensive logging for monitoring
 * 
 * @param {Object} context - Firebase Cloud Function context
 * @param {Object} context.app - App Check verification context
 * @param {Object} context.data - Feedback submission data
 * @param {string} context.data.accountID - User account identifier
 * @param {string} context.data.response - Feedback content/message
 * @param {Object} [context.data.esiData] - Optional ESI data for debugging
 * @returns {Promise<Object>} Success message object
 * 
 * @example
 * // Submit feedback with ESI data
 * const result = await storeFeedback({
 *   data: {
 *     accountID: 'user123',
 *     response: 'The market prices are not updating correctly',
 *     esiData: { marketData: {...}, characterData: {...} }
 *   }
 * });
 * console.log('Feedback submitted:', result.message);
 * 
 * @example
 * // Submit feedback without ESI data
 * const result = await storeFeedback({
 *   data: {
 *     accountID: 'user456',
 *     response: 'Great app! Love the new features.'
 *   }
 * });
 * console.log('Feedback submitted:', result.message);
 * 
 * @throws {Error} When App Check verification fails
 * @throws {Error} When required data is missing
 * @throws {Error} When Discord webhook sending fails
 * @throws {Error} When Firebase Storage operation fails
 * 
 * @see {@link https://discord.js.org/} Discord.js library documentation
 * @see {@link https://firebase.google.com/docs/storage} Firebase Storage documentation
 */
export default onCall(
  {
    region: FIREBASE_SERVER_REGION,
    memory: "256MiB",
    timeoutSeconds: 60,
    enforceAppCheck: true,
    secrets: [FEEDBACKURL],
  },
  async (context) => {
    try {
      if (!context.app || !context.data) {
        throw new Error("Missing required data.");
      }

      const feedbackUrl = FEEDBACKURL.value();

      const data = context.data;
      const fileID = crypto.randomUUID();
      let storageSavePromise = null;

      if (data.esiData) {
        storageSavePromise = bucket
          .file(`${fileID}.json`)
          .save(JSON.stringify(data.esiData));
      }

      const webhookClient = new WebhookClient({
        url: feedbackUrl,
      });

      const embed = new EmbedBuilder()
        .setTitle("New Feedback")
        .setFields(
          { name: "AccountID", value: data.accountID, inline: false },
          {
            name: "ESI Data Included",
            value: data.esiData ? "True" : "False",
            inline: false,
          },
          {
            name: "Document ID",
            value: data.esiData ? fileID : "N/A",
          },
          { name: "Feedback Content", value: data.response, inline: false }
        )
        .setColor("#3D85C6");

      await webhookClient.send({
        username: "Feedback Webhook",
        embeds: [embed],
      });

      if (storageSavePromise) {
        await storageSavePromise;
      }

      log("Feedback Submitted Successfully");

      return { message: "Feedback submitted successfully." };
    } catch (err) {
      error("Failed to submit feedback", err);
      throw new Error("Failed to submit feedback.");
    }
  }
);
