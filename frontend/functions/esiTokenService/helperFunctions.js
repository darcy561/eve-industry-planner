import { FIREBASE_SERVER_REGION } from "../global-config-functions.js";

/**
 * Gets the ESI Token Manager service URL for the current Firebase project.
 * 
 * This function constructs the URL for the ESI Token Manager service:
 * - Uses Firebase Functions v2 HTTP function URL format
 * - Constructs URL based on project ID and region
 * - Returns the complete service endpoint URL
 * 
 * @returns {Promise<string>} The ESI Token Manager service URL
 * 
 * @example
 * const url = await getESITokenMangerServiceURL();
 * console.log(url); // https://us-central1-project.cloudfunctions.net/esiTokenMangerService
 */
export async function getESITokenMangerServiceURL() {
    // For Firebase Functions v2 HTTP functions, use the direct URL format
    const projectId = process.env.GCLOUD_PROJECT;
    const region = FIREBASE_SERVER_REGION;
    
    // Firebase Functions v2 HTTP functions use this URL format
    return `https://${region}-${projectId}.cloudfunctions.net/esiTokenMangerService`;
}

/**
 * Sends a request to the ESI Token Manager service.
 * 
 * This function communicates with the ESI Token Manager service:
 * - Constructs the service URL dynamically
 * - Sends HTTP POST requests with token management data
 * - Handles response parsing and error management
 * - Provides comprehensive error logging
 * 
 * @param {Object} requestData - Request data object
 * @param {string} requestData.action - Action type ("request" or "confirm")
 * @param {number} requestData.groupId - Token group ID
 * @param {string} requestData.taskId - Unique task identifier
 * @param {number} [requestData.requestedTokens] - Number of tokens requested
 * @param {number} [requestData.usedTokens] - Number of tokens used
 * @param {number} [requestData.remainingTokensFromHeaders] - Remaining tokens from API response
 * @returns {Promise<Object>} Response data from the token manager service
 * @throws {Error} Throws error if HTTP request fails
 * 
 * @example
 * const result = await sendRequestToESITokenManager({
 *   action: "request",
 *   groupId: 0,
 *   taskId: "task-123",
 *   requestedTokens: 10
 * });
 */
export async function sendRequestToESITokenManager({ action, groupId, taskId, requestedTokens, usedTokens, remainingTokensFromHeaders }) {
    try {
        const url = await getESITokenMangerServiceURL();
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action,
                groupId,
                taskId,
                requestedTokens,
                usedTokens,
                remainingTokensFromHeaders
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error calling esiTokenMangerService:', error);
        throw error;
    }
}

/**
 * Converts ESI API response headers to token cost information.
 * 
 * This function extracts rate limiting information from ESI API responses:
 * - Parses X-Ratelimit-Remaining header for remaining tokens
 * - Parses X-Ratelimit-Used header for used tokens
 * - Returns structured token cost data for rate limiting
 * - Handles missing or invalid headers gracefully
 * 
 * @param {Response} response - HTTP response object from ESI API
 * @returns {Object} Token cost information
 * @returns {number} returns.remainingTokensFromHeaders - Remaining tokens from headers
 * @returns {number} returns.finalUsedTokens - Used tokens from headers
 * 
 * @example
 * const { remainingTokensFromHeaders, finalUsedTokens } = convertServerResponseToTokenCost(response);
 * console.log(`Used: ${finalUsedTokens}, Remaining: ${remainingTokensFromHeaders}`);
 */
export function convertServerResponseToTokenCost(response) {

    const remainingTokensFromHeaders = Number(response.headers.get('X-Ratelimit-Remaining'));
    const finalUsedTokens = Number(response.headers.get('X-Ratelimit-Used'));

    return { remainingTokensFromHeaders, finalUsedTokens }
}

