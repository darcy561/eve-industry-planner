import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from "firebase-admin/database";
import {
  FIREBASE_SERVER_REGION,
  FIREBASE_SERVER_TIMEZONE,
} from "../global-config-functions.js";
import checkEveSeverStatus from "../sharedFunctions/eveServerStatus.js";
import { error, info, warn } from "firebase-functions/logger";
import fetchWithCustomHeaders from "../util/fetchWithHeaders.js";
import { convertServerResponseToTokenCost, sendRequestToESITokenManager } from "../esiTokenService/helperFunctions.js";
import { ESI_TOKEN_GROUP_MAP } from "../esiTokenService/esi-token-groups.js";

/**
 * Scheduled Firebase Cloud Function for refreshing EVE Online system cost indices.
 * 
 * This function runs every hour to update system cost indices for industry calculations:
 * - Checks EVE Online server status before proceeding
 * - Fetches latest system cost indices from ESI API
 * - Processes cost indices for all solar systems
 * - Updates Firebase Realtime Database with latest data
 * - Provides comprehensive error handling and logging
 * 
 * Schedule: Every hour
 * Timeout: Default (60 seconds)
 * 
 * @function refreshSystemIndexes
 * @param {Object} event - Scheduled event object from Firebase Scheduler
 * @returns {Promise<null>} Always returns null
 * 
 * @example
 * // Function runs automatically via Firebase Scheduler
 * // Updates system cost indices for industry calculations
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
      const serverStatus = await checkEveSeverStatus(null);
      if (!serverStatus) {
        return null;
      }

      const taskId = `${event.timestamp}-${ESI_TOKEN_GROUP_MAP.INDUSTRY}`;

      const tokenRequest = await sendRequestToESITokenManager({
        action: "request",
        groupId: ESI_TOKEN_GROUP_MAP.INDUSTRY,
        requestedTokens: 2,
        taskId: taskId,
      });

      if (tokenRequest.status !== "confirmed") {
        warn("Insufficient tokens to refresh system indexes");
        return null;
      }

      const systemIndexResponse = await fetchWithCustomHeaders(
        "https://esi.evetech.net/v1/industry/systems/?datasource=tranquility"
      );

      const { remainingTokensFromHeaders, finalUsedTokens } = convertServerResponseToTokenCost(systemIndexResponse);

      await sendRequestToESITokenManager({
        action: "confirm",
        groupId: ESI_TOKEN_GROUP_MAP.INDUSTRY,
        taskId: taskId,
        usedTokens: finalUsedTokens,
        remainingTokensFromHeaders
      });

      if (!systemIndexResponse.ok) {
        throw new Error(
          `Request failed with status ${systemIndexResponse.status}`
        );
      }

      const systemIndexData = await systemIndexResponse.json();

      const combinedObject = {};
      for (const system of systemIndexData) {
        const { solar_system_id, cost_indices } = system;
        combinedObject[solar_system_id] = {
          solar_system_id,
          lastUpdated: Date.now(),
        };

        cost_indices.forEach(({ activity, cost_index }) => {
          combinedObject[solar_system_id][activity] = cost_index;
        });
      }

      await db.ref("live-data/system-indexes").update(combinedObject);

      info(
        `System Index Data Updated Successfully: ${Object.keys(combinedObject).length
        } systems`
      );
      return null;
    } catch (err) {
      error(`An error occurred: ${err.stack || err}`);
      return null;
    }
  }
);
