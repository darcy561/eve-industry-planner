import { getAuth } from "firebase-admin/auth";
import { JwksClient } from "jwks-rsa";
import jwt from "jsonwebtoken";
import { error, log } from "firebase-functions/logger";
import { onCall } from "firebase-functions/v2/https";

import { FIREBASE_SERVER_REGION } from "../global-config-functions.js";
import fetchWithCustomHeaders from "../util/fetchWithHeaders.js";

const { decode, verify } = jwt;

/**
 * JWT client for EVE Online OAuth token verification.
 * 
 * This client is configured to fetch JSON Web Key Sets (JWKS) from EVE Online's OAuth service
 * to verify the authenticity of JWT tokens issued by EVE Online's authentication system.
 * 
 * @type {JwksClient}
 * @see {@link https://login.eveonline.com/oauth/jwks} EVE Online JWKS endpoint
 */
const client = new JwksClient({
  jwksUri: "https://login.eveonline.com/oauth/jwks",
});

/**
 * Firebase Cloud Function that processes EVE Online character authentication tokens
 * and sets custom user claims for corporation access control.
 * 
 * This function handles the complex process of verifying EVE Online OAuth tokens
 * and extracting corporation information to set Firebase custom user claims:
 * - Verifies JWT tokens using EVE Online's public keys
 * - Extracts character IDs from verified tokens
 * - Fetches character data from EVE ESI API to get corporation IDs
 * - Sets Firebase custom user claims with corporation access information
 * - Provides secure corporation-based access control for the application
 * 
 * The processing workflow:
 * 1. Validates App Check authentication for security
 * 2. Processes each character authentication token in the request
 * 3. Verifies JWT tokens using EVE Online's JWKS endpoint
 * 4. Extracts character IDs from verified token subjects
 * 5. Fetches character data from EVE ESI API
 * 6. Collects unique corporation IDs from all characters
 * 7. Sets Firebase custom user claims with corporation information
 * 
 * Security features:
 * - App Check enforcement for request verification
 * - JWT token verification using EVE Online's public keys
 * - Issuer validation against EVE Online OAuth endpoints
 * - Character data validation through ESI API
 * - Error handling and logging for security monitoring
 * 
 * @param {Object} request - Firebase Cloud Function request object
 * @param {Object} request.auth - Authentication context
 * @param {string} request.auth.uid - Firebase user ID
 * @param {Object} request.app - App Check verification context
 * @param {Array<Object>} request.data - Array of character authentication data
 * @param {string} request.data[].authToken - EVE Online OAuth JWT token for character
 * @returns {Promise<Object|null>} Returns null on success or error object on failure
 * 
 * @example
 * // Function call with character authentication tokens
 * const result = await addCorpClaim({
 *   data: [
 *     { authToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' },
 *     { authToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' }
 *   ]
 * });
 * 
 * @throws {Error} When App Check verification fails
 * @throws {Error} When JWT token verification fails
 * @throws {Error} When ESI API requests fail
 * @throws {Error} When Firebase custom claims setting fails
 * 
 * @see {@link https://login.eveonline.com/oauth/jwks} EVE Online JWKS endpoint
 * @see {@link https://esi.evetech.net/} EVE Online ESI API documentation
 * @see {@link https://firebase.google.com/docs/auth/admin/custom-claims} Firebase custom claims documentation
 */
export default onCall(
  {
    region: FIREBASE_SERVER_REGION,
    memory: "256MiB",
    timeoutSeconds: 60,
    enforceAppCheck: true,
  },
  async (request) => {
    /**
     * Internal function that processes character tokens and sets corporation claims.
     * 
     * This function handles the core logic of the corporation claim setting process:
     * - Decodes and verifies JWT tokens from EVE Online
     * - Extracts character IDs and fetches corporation information
     * - Collects unique corporation IDs from all characters
     * - Sets Firebase custom user claims with corporation access
     * 
     * @returns {Promise<void>} Resolves when claims are set successfully
     * @throws {Error} When token verification or ESI API calls fail
     */
    async function setClaim() {
      try {
        const data = request.data;
        let corpIDs = new Set();

        for (let charData of data) {
          const decodedToken = decode(charData.authToken);
          const kid = decodedToken.kid;

          const key = await client.getSigningKey(kid);
          const publicKey = key.getPublicKey();

          let decoded;
          try {
            decoded = verify(charData.authToken, publicKey);

            if (
              decoded.iss !== "login.eveonline.com" &&
              decoded.iss !== "https://login.eveonline.com"
            ) {
              error(`${request.auth.uid} failed to verify Eve Token`);
              return; 
            }

            const characterID = Number(
              decodedToken.sub.match(/\w*:\w*:(\d*)/)[1]
            );
            const response = await fetchWithCustomHeaders(
              `https://esi.evetech.net/v5/characters/${characterID}/?datasource=tranquility`
            );
            if (response.ok) {
              const responseData = await response.json();
              corpIDs.add(responseData.corporation_id);
            } else {
              error(`Failed to fetch data for characterID: ${characterID}`);
            }
          } catch (err) {
            error("Token verification failed", err);
            return; 
          }
        }

        log(`${request.auth.uid} Corporation Claims Updated`);
        await getAuth().setCustomUserClaims(request.auth.uid, {
          corporations: [...corpIDs],
        });
      } catch (err) {
        error("Error setting claims", err);
        throw new Error("Error setting claims");
      }
    }

    if (!request.app) {
      error("Unathorised Claims User");
      return { error: "Unauthorised User" };
    }
    try {
      await setClaim();
      return null;
    } catch (err) {
      error("Error in claim setting function", err);
      return { error: "Error processing request" };
    }
  }
);
