import { decodeJwt } from "jose";
import User from "../../../Classes/usersConstructor";

/**
 * Exchanges EVE SSO authorization code for access token and creates user object.
 * Handles the OAuth2 flow to authenticate users with EVE Online's SSO system.
 * Now uses the backend API endpoint instead of calling EVE SSO directly.
 * 
 * @param {string} authCode - Authorization code received from EVE SSO callback
 * @param {boolean} [accountType=false] - Whether this is an account-level authentication
 * @returns {Promise<User|Error>} Promise that resolves to User object or Error
 * 
 * @throws {Error} Throws error if authCode is missing or SSO authentication fails
 * 
 * @example
 * const user = await getEveOauthToken("auth_code_123", true);
 * if (user instanceof User) {
 *   console.log("User authenticated:", user.characterName);
 * }
 */
async function getEveOauthToken(authCode, accountType = false) {
  try {
    if (!authCode) {
      throw new Error("Missing Auth Code");
    }

    const response = await fetch("/api/v1/sso/exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_code: authCode,
        account_type: accountType,
      }),
    });

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

    const newUser = new User(decodedToken, tokenJSON, accountType);
    if (accountType) {
      localStorage.setItem("Auth", tokenJSON.refresh_token);
    }
    return newUser;
  } catch (err) {
    console.error("EVE SSO Authentication Error:", err);
    return new Error(`Unable to Authenticate SSO Token: ${err.message}`);
  }
}
export default getEveOauthToken;
