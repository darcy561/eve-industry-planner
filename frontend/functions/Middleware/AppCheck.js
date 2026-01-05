import logErrorAndRespond from "../api/logErrorMessage.js";
import { getAppCheck } from "firebase-admin/app-check";

/**
 * Firebase App Check verification middleware.
 * 
 * This middleware verifies Firebase App Check tokens to ensure requests come from legitimate sources:
 * - Extracts App Check token from X-Firebase-AppCheck header
 * - Verifies token authenticity using Firebase Admin SDK
 * - Blocks unauthorized requests with 401 status
 * - Allows verified requests to proceed to next middleware
 * - Provides comprehensive error logging
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>} Calls next() on success or sends error response
 * 
 * @example
 * // Usage in Express app
 * app.use(appCheckVerification);
 */
async function appCheckVerification(req, res, next) {
  const appCheckClaims = await verifyAppCheckToken(
    req.header("X-Firebase-AppCheck")
  );
  if (!appCheckClaims) {
    logErrorAndRespond(
      "Unauthorised App Check Token",
      res,
      next,
      401,
      req.header("X-Firebase-AppCheck")
    );
  } else {
    next();
  }
}

/**
 * Verifies Firebase App Check token using Firebase Admin SDK.
 * 
 * This function validates App Check tokens:
 * - Checks if token is provided
 * - Uses Firebase Admin SDK to verify token authenticity
 * - Returns token claims on success or null on failure
 * - Handles verification errors gracefully
 * 
 * @param {string} token - Firebase App Check token to verify
 * @returns {Promise<Object|null>} Token claims if valid, null if invalid
 * 
 * @example
 * const claims = await verifyAppCheckToken(token);
 * if (claims) {
 *   console.log('Token verified successfully');
 * }
 */
async function verifyAppCheckToken(token) {
  try {
    if (!token) {
      return null;
    }
    return await getAppCheck().verifyToken(token);
  } catch (err) {
    logErrorAndRespond("Error Verifying AppCheck Token", null, null, null);
    return null;
  }
}

export default appCheckVerification;
