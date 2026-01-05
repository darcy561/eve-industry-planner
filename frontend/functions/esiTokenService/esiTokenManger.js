import { onRequest } from "firebase-functions/v2/https";
import ESITokenManager from "./ESITokenConstructor.js";
import { FIREBASE_SERVER_REGION, FIREBASE_SERVER_TIMEZONE } from "../global-config-functions.js";
import { error, log } from "firebase-functions/logger";

let tokenManager = null;
let initialized = false;

/**
 * Lazy initialization function for ESI Token Manager.
 * 
 * This function ensures the ESI Token Manager is initialized only once per function instance:
 * - Creates a new ESITokenManager instance if not already initialized
 * - Configures token groups from the configuration
 * - Handles initialization errors gracefully
 * - Prevents multiple initialization attempts
 * 
 * @returns {Promise<void>} Resolves when initialization is complete
 * 
 * @example
 * await ensureInitialized();
 * // Token manager is now ready for use
 */
async function ensureInitialized() {
    if (!initialized) {
        try {
            tokenManager = new ESITokenManager();
            await tokenManager.configureGroups();
            initialized = true;
            log("ESI Token Manager initialised");
        } catch (error) {
            log("ESI Token Manager initialization failed, continuing with defaults:", error);
            initialized = true; // Mark as initialized to prevent retries
        }
    }
}

/**
 * Firebase Cloud Function for ESI Token Management Service.
 * 
 * This function provides a centralized service for managing ESI API rate limiting:
 * - Handles token requests and confirmations for different groups
 * - Manages token pools and rate limiting across function instances
 * - Supports request and confirm actions for token lifecycle management
 * - Writes token pool state to database for persistence
 * - Provides comprehensive error handling and logging
 * 
 * Configuration:
 * - Max instances: 1 (singleton service)
 * - Memory: 128MB
 * - Timeout: 5 minutes
 * - Concurrency: 1 (sequential processing)
 * 
 * @function esiTokenMangerService
 * @param {Object} req - HTTP request object
 * @param {string} req.body.action - Action type ("request" or "confirm")
 * @param {number} req.body.groupId - Token group ID
 * @param {string} req.body.taskId - Unique task identifier
 * @param {number} [req.body.requestedTokens] - Number of tokens requested
 * @param {number} [req.body.usedTokens] - Number of tokens used
 * @param {number} [req.body.remainingTokensFromHeaders] - Remaining tokens from API response
 * @param {Object} res - HTTP response object
 * @returns {Promise<void>} Sends JSON response with result or error
 * 
 * @example
 * // Request tokens
 * POST /esiTokenMangerService
 * {
 *   "action": "request",
 *   "groupId": 0,
 *   "taskId": "task-123",
 *   "requestedTokens": 10
 * }
 */
export default onRequest({
    region: FIREBASE_SERVER_REGION,
    timeZone: FIREBASE_SERVER_TIMEZONE,
    maxInstances: 1,
    minInstances: 0,
    concurrency: 1,
    memory: "128MB",
    timeoutSeconds: 300,
}, async (req, res) => {
    try {
        await ensureInitialized();

        const { action, groupId, taskId, requestedTokens, usedTokens, remainingTokensFromHeaders } = req.body;

        let result;

            switch (action) {
                case "request":
                    result = await tokenManager.requestTokens(groupId, taskId, requestedTokens);
                    break;
                case "confirm":
                    result = await tokenManager.completeTokenUsage(groupId, taskId, usedTokens, remainingTokensFromHeaders);
                    break;

                default:
                    throw new Error("Invalid action");
            }

        await tokenManager.writeTokenPoolsToDatabase();

        res.status(200).json(result);
    } catch (err) {
        error("Error in esiTokenManger:", err);
        res.status(500).json({ error: "INTERNAL_ERROR", message: "Error in esiTokenManger" });
    }
});