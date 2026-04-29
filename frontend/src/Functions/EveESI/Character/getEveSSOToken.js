import { decodeJwt } from "jose";
import Character from "../../../Classes/character";
import { fetchWithPublicHeaders } from "../../Endpoints/Public/applyPublicHeaders.js";

/**
 * Exchanges EVE SSO authorization code for access token and builds a {@link Character} instance.
 * Uses the backend `/api/v1/sso/exchange` endpoint.
 *
 * @param {string} authCode - Authorization code from EVE SSO callback
 * @param {boolean} [accountType=false] - Main planner character (persists refresh to `Auth`)
 * @returns {Promise<Character|Error>}
 *
 * @throws {Error} When authCode is missing or SSO fails
 *
 * @example
 * const character = await getEveOauthToken("auth_code_123", true);
 * if (character instanceof Character) {
 *   console.log("Authenticated:", character.CharacterName);
 * }
 */
async function getEveOauthToken(authCode, accountType = false) {
  try {
    if (!authCode) {
      throw new Error("Missing Auth Code");
    }

    const response = await fetchWithPublicHeaders(
      "/api/v1/eve-sso/tokens/exchange",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_code: authCode,
          account_type: accountType,
        }),
      },
      { requestName: "exchangeEsiSsoCode" }
    );

    // Handle client errors (4xx)
    if (response.status >= 400 && response.status < 500) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `EVE SSO Error: ${response.status} ${response.statusText}`
      );
    }

    // Handle server errors (5xx)
    if (response.status >= 500) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `EVE SSO Error: Server error (${response.status})`
      );
    }

    // Handle successful responses (2xx)
    if (!response.ok) {
      throw new Error(`EVE SSO Error: ${response.status} ${response.statusText}`);
    }

    const tokenJSON = await response.json();

    if (!tokenJSON.access_token) {
      throw new Error("No access token received from EVE SSO");
    }

    const decodedToken = decodeJwt(tokenJSON.access_token);

    const newCharacter = new Character({
      jwtPayload: decodedToken,
      tokenResponse: tokenJSON,
      isMainCharacter: accountType,
    });
    if (accountType) {
      localStorage.setItem("Auth", tokenJSON.refresh_token);
    }
    return newCharacter;
  } catch (err) {
    console.error("EVE SSO Authentication Error:", err);
    return new Error(`Unable to Authenticate SSO Token: ${err.message}`);
  }
}
export default getEveOauthToken;
