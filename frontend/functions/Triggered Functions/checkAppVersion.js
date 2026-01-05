import { HttpsError, onCall } from "firebase-functions/v2/https";
import { warn } from "firebase-functions/logger";
import checkAppVersion from "../sharedFunctions/appVersion.js";
import { FIREBASE_SERVER_REGION } from "../global-config-functions.js";

/**
 * Firebase Cloud Function that validates application version compatibility.
 * 
 * This function provides app version checking functionality for the EVE Industry Planner:
 * - Validates App Check authentication for security
 * - Delegates version checking to shared app version validation logic
 * - Ensures only verified applications can check version compatibility
 * - Provides centralized version management for client applications
 * 
 * The version checking process:
 * 1. Validates App Check authentication context
 * 2. Delegates to shared app version checking function
 * 3. Returns version compatibility information
 * 4. Handles authentication errors with appropriate error responses
 * 
 * Security features:
 * - App Check enforcement for request verification
 * - Centralized version validation logic
 * - Error handling for unverified requests
 * 
 * @param {Object} data - Request data containing app version information
 * @param {string} data.appVersion - The client application version to validate
 * @param {Object} context - Firebase Cloud Function context
 * @param {Object} context.app - App Check verification context
 * @returns {Promise<Object>} Version compatibility information from shared function
 * 
 * @example
 * // Function call with app version
 * const result = await checkAppVersion({
 *   appVersion: '1.2.3'
 * });
 * console.log('Version check result:', result);
 * 
 * @throws {HttpsError} When App Check verification fails
 * @throws {Error} When version checking logic fails
 * 
 * @see {@link ../sharedFunctions/appVersion.js} Shared app version checking logic
 */
export default onCall({ region: FIREBASE_SERVER_REGION }, (data, context) => {
  if (context.app == undefined) {
    warn("Unverified function Call", context);
    throw new HttpsError(
      "Unable to verify",
      "Function must be called from a verified app"
    );
  }

  return checkAppVersion(data.appVersion);
});
