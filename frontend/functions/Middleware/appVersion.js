import logErrorAndRespond from "../api/logErrorMessage.js";
import checkAppVersion from "../sharedFunctions/appVersion.js";

/**
 * App version verification middleware.
 * 
 * This middleware verifies that requests come from compatible app versions:
 * - Extracts app version from appVersion header
 * - Compares version with current supported version
 * - Blocks outdated app versions with 401 status
 * - Allows compatible versions to proceed to next middleware
 * - Provides comprehensive error logging
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next() on success or sends error response
 * 
 * @example
 * // Usage in Express app
 * app.use(checkVersion);
 */
function checkVersion(req, res, next) {
  let verify = checkAppVersion(req.header("appVersion"));

  if (!verify) {
    logErrorAndRespond(
      "Outdated App Version",
      res,
      next,
      401,
      req.header("appVersion")
    );
  } else {
    next();
  }
}
export default checkVersion;
