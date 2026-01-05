/**
 * Refreshes an expired EVE SSO access token using the refresh token.
 * Exchanges a refresh token for a new access token to maintain authentication.
 * Now uses the backend API endpoint instead of calling EVE SSO directly.
 * 
 * @param {string} refreshToken - Refresh token obtained during initial authentication
 * @returns {Promise<Object|Error>} Promise that resolves to token response object or Error
 * 
 * @throws {Error} Throws error if refresh token is invalid or API request fails
 * 
 * @example
 * const tokenResponse = await refreshAccessTokenESICall("refresh_token_123");
 * if (tokenResponse.access_token) {
 *   console.log("New access token:", tokenResponse.access_token);
 * }
 */
async function refreshAccessTokenESICall(refreshToken) {
  try {
    const response = await fetch("/api/v1/sso/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

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
