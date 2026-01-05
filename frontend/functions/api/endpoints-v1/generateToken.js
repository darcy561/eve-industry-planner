import { getAuth } from "firebase-admin/auth";
import { error, log, debug, warn } from "firebase-functions/logger";
import buildNewUserdata from "../buildNewUserData.js";

/**
 * Generates Firebase custom token from EVE Online OAuth data.
 * 
 * This endpoint handles Firebase authentication for EVE Online users:
 * - Validates EVE Online OAuth token (verified by middleware)
 * - Creates or retrieves Firebase user record
 * - Generates Firebase custom token for client authentication
 * - Creates initial user data structure for new users
 * - Provides comprehensive logging and error handling
 * - Returns token and first-time login status
 * 
 * @param {Object} req - Express request object
 * @param {string} req.body.UID - EVE Online character ID (verified by middleware)
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Sends JSON response with Firebase token
 * 
 * @example
 * // Request body (after EVE token verification):
 * {
 *   "UID": "1234567890",
 *   "CharacterHash": "character_hash",
 *   "Access-Token": "eve_oauth_token"
 * }
 * 
 * // Response:
 * {
 *   "access_token": "firebase_custom_token",
 *   "isFirstTimeLogin": false
 * }
 */
async function generateFirebaseToken(req, res) {
  const startTime = Date.now();
  const UID = req.body.UID;
  
  debug("Generate Token Request Started", {
    UID: UID ? UID.substring(0, 8) + "..." : "undefined",
    hasUID: !!UID,
    requestBodyKeys: Object.keys(req.body || {}),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  if (typeof UID !== "string" || UID.trim() === "") {
    warn("Invalid or missing UID in generate token request", {
      UID: UID,
      UIDType: typeof UID,
      requestBody: req.body
    });
    return res.status(400).send("Invalid or missing UID");
  }

  try {
    const auth = getAuth();
    let userRecord;
    let userExists = false;
    
    try {
      debug("Checking if user exists in Firebase Auth", { UID: UID.substring(0, 8) + "..." });
      userRecord = await auth.getUser(UID);
      userExists = true;
      debug("User found in Firebase Auth", { 
        UID: UID.substring(0, 8) + "...",
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime
      });
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        debug("User not found in Firebase Auth, creating new user data", { 
          UID: UID.substring(0, 8) + "...",
          errorCode: err.code
        });
        await buildNewUserdata(UID);
        log("New user data created successfully", { UID: UID.substring(0, 8) + "..." });
      } else {
        error("Unexpected error checking user existence", {
          UID: UID.substring(0, 8) + "...",
          errorCode: err.code,
          errorMessage: err.message,
          errorStack: err.stack
        });
        throw err;
      }
    }

    debug("Creating custom Firebase token", { UID: UID.substring(0, 8) + "..." });
    const authToken = await auth.createCustomToken(UID);
    const duration = Date.now() - startTime;
    
    log("Firebase Auth Token successfully generated", {
      UID: UID.substring(0, 8) + "...",
      userExisted: userExists,
      tokenLength: authToken.length,
      duration: `${duration}ms`
    });
    
    return res.status(200).send({
      access_token: authToken,
      isFirstTimeLogin: !userExists,
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    error("Error generating Firebase Auth Token", {
      UID: UID ? UID.substring(0, 8) + "..." : "undefined",
      errorCode: err.code,
      errorMessage: err.message,
      errorStack: err.stack,
      duration: `${duration}ms`
    });
    return res.status(500).send({
      error: "INTERNAL_ERROR",
      message: "Error generating auth token. Please contact the administrator.",
    });
  }
}

export default generateFirebaseToken;
