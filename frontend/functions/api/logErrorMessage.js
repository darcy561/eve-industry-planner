import { error } from "firebase-functions/logger";

/**
 * Logs error messages and optionally responds with error status.
 * 
 * This utility function provides centralized error logging and response handling:
 * - Logs error messages to Firebase Functions logger
 * - Optionally logs additional error content as JSON
 * - Can send HTTP error responses with specified status codes
 * - Provides consistent error handling across API endpoints
 * 
 * @param {string} returnMessage - Primary error message to log and return
 * @param {Object} [res] - Express response object (optional)
 * @param {Function} [next] - Express next middleware function (optional)
 * @param {number} [statusCode] - HTTP status code to send (optional)
 * @param {any} [errorContent] - Additional error content to log (optional)
 * @returns {void}
 * 
 * @example
 * // Log error only
 * logErrorAndRespond("Database connection failed");
 * 
 * // Log error and send response
 * logErrorAndRespond("Invalid token", res, next, 401, tokenData);
 */
function logErrorAndRespond(
  returnMessage,
  res,
  next,
  statusCode,
  errorContent
) {
  error(returnMessage);
  if (errorContent) {
    error(JSON.stringify(errorContent));
  }
  if (res && next && statusCode) {
    res.status(statusCode);
    next(returnMessage);
  }
}

export default logErrorAndRespond;
