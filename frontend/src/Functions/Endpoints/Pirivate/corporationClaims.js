import fetchWithPrivateHeaders from "./applyPrivateHeaders.js";

/**
 * Requests corporation claims update for the provided EVE SSO tokens.
 * 
 * This function submits an array of EVE SSO tokens to the server, which will
 * extract character IDs, query ESI for corporation information, and update
 * the user's corporation claims in their JWT token.
 * Automatically applies both public and private headers.
 * 
 * @param {Array<string>} accessTokenArray - Array of EVE SSO JWT tokens (strings)
 * @returns {Promise<boolean>} Promise that resolves to true if successful, false if failed
 * 
 * @example
 * const tokens = ["eve-sso-token-1", "eve-sso-token-2"];
 * const success = await updateCorporationClaims(tokens);
 * if (success) {
 *   console.log("Corporation claims update queued successfully");
 * }
 */
async function updateCorporationClaims(accessTokenArray) {
  // Validate input
  if (!accessTokenArray || !Array.isArray(accessTokenArray) || accessTokenArray.length === 0) {
    console.error("Invalid tokens array provided");
    return false;
  }

  // Filter out empty tokens
  const validTokens = accessTokenArray.filter(token => token && token.trim().length > 0);
  if (validTokens.length === 0) {
    console.error("No valid tokens provided");
    return false;
  }

  const URL = `/api/v1/auth/claims/corporations`;

  try {
    const response = await fetchWithPrivateHeaders(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tokens: validTokens,
      }),
    });

    if (!response.ok) {
      // Error responses are typically plain text from http.Error()
      const errorText = await response.text();
      console.error(`Failed to request corporation claims: ${response.status} ${response.statusText}`, errorText);
      return false;
    }

    // Endpoint returns 204 No Content on success (no body)
    return true;
  } catch (error) {
    console.error("Error requesting corporation claims:", error);
    return false;
  }
}

export default updateCorporationClaims;