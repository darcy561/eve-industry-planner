import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import { log } from "firebase-functions/logger";
import logErrorAndRespond from "../api/logErrorMessage.js";

/**
 * EVE Online token verification middleware.
 * 
 * This middleware verifies EVE Online OAuth tokens to ensure requests come from authenticated EVE Online characters:
 * - Extracts access token from Access-Token header
 * - Validates character hash and user ID from request body
 * - Verifies JWT signature using EVE Online's JWKS endpoint
 * - Validates token issuer and character ownership
 * - Blocks unauthorized requests with 401 status
 * - Allows verified requests to proceed to next middleware
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>} Calls next() on success or sends error response
 * 
 * @example
 * // Usage in Express app
 * app.post("/auth/generate-token", verifyEveToken, generateFirebaseToken);
 */
async function verifyEveToken(req, res, next) {
  try {
    const accessToken = req.header("Access-Token");
    const requestedCharacterHash = req.body.CharacterHash;
    const requestedUserID = req.body.UID;

    if (!accessToken) {
      logErrorAndRespond("Missing Access Token", res, next, 401);
    } else if (!requestedCharacterHash || !requestedUserID) {
      logErrorAndRespond("Missing Character Data", res, next, 401);
    } else {
      const decodedToken = jwt.decode(accessToken);
      const kid = decodedToken?.kid;

      if (!kid) {
        logErrorAndRespond(
          "Invalid Eve Token - Missing Key ID",
          res,
          next,
          401
        );
      } else {
        const client = new JwksClient({
          jwksUri: "https://login.eveonline.com/oauth/jwks",
        });
        const key = await client.getSigningKey(kid);
        const getSigningKey = key.getPublicKey();

        jwt.verify(accessToken, getSigningKey, (err, decoded) => {
          if (err) {
            logAndRespond("Error Validating Eve Token", res, next, 401, err.message);
          } else {
            const testID = decoded.owner?.replace(/[^a-zA-z0-9 ]/g, "");
            if (
              decoded.iss ===
              ("https://login.eveonline.com" || "login.eveonline.com")
            ) {
              if (
                decoded.owner === req.body.CharacterHash &&
                testID === req.body.UID
              ) {
                log(`Eve Token Verified - ${testID}`);
                next();
              } else {
                logErrorAndRespond(
                  "Invalid Eve Token",
                  res,
                  next,
                  401,
                  decoded
                );
              }
            } else {
              logErrorAndRespond(
                "Invalid Eve Token - Invalid Issuer",
                res,
                next,
                401,
                decoded
              );
            }
          }
        });
      }
    }
  } catch (error) {
    logErrorAndRespond("Error In Token Verification", res, next, 401, error.message);
  }
}

export default verifyEveToken;
