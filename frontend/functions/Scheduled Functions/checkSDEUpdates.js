import { onSchedule } from "firebase-functions/v2/scheduler";
import { WebhookClient } from "discord.js";
import { defineSecret } from "firebase-functions/params";
import {
  FIREBASE_SERVER_REGION,
  FIREBASE_SERVER_TIMEZONE,
} from "../global-config-functions.js";
import { error, info, log } from "firebase-functions/logger";

const CHECKSDEURL = defineSecret("CHECKSDEURL");
const DISCORDUSERID = defineSecret("DISCORDUSERID");

const SDE_LATEST_URL =
  "https://developers.eveonline.com/static-data/tranquility/latest.jsonl";

/**
 * Scheduled Firebase Cloud Function for checking EVE Online SDE updates.
 * 
 * This function runs daily at 4:00 PM UTC to check for Static Data Export updates:
 * - Fetches latest SDE build information from EVE Online developers API
 * - Parses JSONL format to extract release date and build number
 * - Checks if SDE was updated within the last 24 hours
 * - Sends Discord notification if new SDE version is available
 * - Uses Firebase secrets for Discord webhook URL and user ID
 * 
 * Schedule: Daily at 4:00 PM UTC (0 16 * * *)
 * Timeout: Default (60 seconds)
 * 
 * @function checkSDEUpdates
 * @param {Object} context - Scheduled event context from Firebase Scheduler
 * @returns {Promise<null>} Always returns null
 * 
 * @example
 * // Function runs automatically via Firebase Scheduler
 * // Sends Discord notification when SDE is updated
 */
export default onSchedule(
  {
    schedule: "0 16 * * *",
    region: FIREBASE_SERVER_REGION,
    timeZone: FIREBASE_SERVER_TIMEZONE,
    secrets: [CHECKSDEURL, DISCORDUSERID],
  },
  async (context) => {
    try {
      const checksdeurl = CHECKSDEURL.value();
      const discorduserid = DISCORDUSERID.value();

      // Fetch the latest build information
      const response = await fetch(SDE_LATEST_URL);

      if (!response.ok) {
        error("Failed to fetch SDE latest build information");
        return null;
      }

      const responseText = await response.text();
      const lines = responseText.trim().split("\n");

      // Parse the JSONL format to find the SDE record
      let releaseDate = null;
      let buildNumber = null;

      for (const line of lines) {
        if (line.trim()) {
          const record = JSON.parse(line);
          if (record._key === "sde") {
            releaseDate = record.releaseDate;
            buildNumber = record.buildNumber;
            break;
          }
        }
      }

      if (!releaseDate || !buildNumber) {
        error("Could not find SDE release date or build number in response");
        return null;
      }

      // Check if the release date is within the last 24 hours
      const releaseTimestamp = Date.parse(releaseDate);
      const last24HoursTimestamp = Date.now() - 24 * 60 * 60 * 1000;

      if (releaseTimestamp > last24HoursTimestamp) {
        const webhookClient = new WebhookClient({
          url: checksdeurl,
        });
        const message = `Hey <@${discorduserid}>, the SDE has been updated! Build: ${buildNumber}`;
        await webhookClient.send(message);
        info("SDE update notification sent to Discord");
      } else {
        log("SDE not updated within the last 24 hours");
      }
    } catch (err) {
      error(`Error checking SDE updates: ${err}`);
    }
    return null;
  }
);
