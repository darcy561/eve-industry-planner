import { error, warn } from "firebase-functions/logger";
import fetchWithCustomHeaders from "../util/fetchWithHeaders.js";
import { convertServerResponseToTokenCost, sendRequestToESITokenManager } from "../esiTokenService/helperFunctions.js";
import { ESI_TOKEN_GROUP_MAP } from "../esiTokenService/esi-token-groups.js";

/**
 * Checks the status of EVE Online servers using ESI API.
 * 
 * This function verifies EVE Online server availability:
 * - Requests ESI tokens for server status checking
 * - Makes API call to EVE Online server status endpoint
 * - Handles token management and cost tracking
 * - Returns boolean indicating server availability
 * - Provides comprehensive error handling and logging
 * 
 * @param {string} [traceId=null] - Optional trace ID for request tracking
 * @returns {Promise<boolean>} True if servers are available, false otherwise
 * 
 * @example
 * const isServerUp = await checkEveSeverStatus("trace-123");
 * if (isServerUp) {
 *   console.log("EVE Online servers are operational");
 * } else {
 *   console.log("EVE Online servers are down");
 * }
 */
async function checkEveSeverStatus(traceId = null) {
  try {
    // Generate task ID using trace ID if available
    const taskId = traceId ? `${traceId}-${ESI_TOKEN_GROUP_MAP.STATUS}` : `${ESI_TOKEN_GROUP_MAP.STATUS}-${Date.now()}`;


    const tokenRequest = await sendRequestToESITokenManager({
      action: "request",
      groupId: ESI_TOKEN_GROUP_MAP.STATUS,
      requestedTokens: 2,
      taskId: taskId,
    });

    if (tokenRequest.status !== "confirmed") {
      warn("Insufficient tokens to check Eve Servers");
      return false;
    }

    const serverResponse = await fetchWithCustomHeaders(
      "https://esi.evetech.net/v2/status/?datasource=tranquility"
    );


    const { remainingTokensFromHeaders, finalUsedTokens } = convertServerResponseToTokenCost(serverResponse);

    await sendRequestToESITokenManager({
      action: "confirm",
      groupId: ESI_TOKEN_GROUP_MAP.STATUS,
      taskId: taskId,
      usedTokens: finalUsedTokens,
      remainingTokensFromHeaders
    });

    if (!serverResponse.ok) {
      warn("Eve Servers Unavailable");
      return false;
    }
    return true;
  } catch (err) {
    error("Error Querying Eve Servers", err);
  }
}

export default checkEveSeverStatus;
