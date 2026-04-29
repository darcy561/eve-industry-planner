import { fetchWithPublicHeaders } from "../../Endpoints/Public/applyPublicHeaders.js";

/**
 * Refreshes an expired EVE SSO access token using the refresh token.
 * Exchanges a refresh token for a new access token to maintain authentication.
 * `POST /api/v1/sso/refresh` is sent with `fetchWithPublicHeaders` (same public headers and
 * default retries as the rest of the app: 408 / 429 / 5xx; see `withRequestRetries.js`).
 * @param {string} refreshToken - Refresh token obtained during initial authentication
 * @returns {Promise<Object|Error>} Promise that resolves to token response object or Error
 * @throws {Error} Throws error if refresh token is invalid or API request fails
 */
async function refreshAccessTokenESICall(refreshToken) {
  try {
    if (!refreshToken || !String(refreshToken).trim()) {
      throw new Error("Refresh token is required for /api/v1/sso/refresh");
    }
    const response = await fetchWithPublicHeaders(
      "/api/v1/eve-sso/tokens/refresh",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      },
      { requestName: "refreshEsiAccessToken" }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error refreshing access token: ${err}`);
    return err;
  }
}

export default refreshAccessTokenESICall;
