import { APP_VERSION } from "../global-config-functions.js";

/**
 * Checks if the requested app version matches the current app version.
 * 
 * This function validates app version compatibility:
 * - Compares the requested version with the current APP_VERSION
 * - Returns boolean indicating version match status
 * - Used for API version validation and compatibility checks
 * 
 * @param {string} requestedAppVersion - The app version string to validate
 * @returns {boolean} True if versions match, false otherwise
 * 
 * @example
 * const isValidVersion = checkAppVersion("1.2.3");
 * if (isValidVersion) {
 *   console.log("App version is compatible");
 * } else {
 *   console.log("App version mismatch");
 * }
 */
function checkAppVersion(requestedAppVersion) {
  if (requestedAppVersion !== APP_VERSION) {
    return false;
  }
  return true;
}

export default checkAppVersion;
