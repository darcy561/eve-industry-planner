import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const CLAIMS_URL = "/api/v1/auth/claims/corporations";

/**
 * Requests corporation claims update for the provided EVE SSO tokens.
 *
 * POST `/api/v1/auth/claims/corporations`. Submits tokens; server validates SSO JWTs and queues a worker task.
 * Uses the same private-route stack as other authenticated APIs (rate limit → auth → handler).
 *
 * Retries (via `requestWithPrivateHeaders`): **408 / 429 / 5xx** only — not **400**, **401**, **405**.
 * Matches `CorporationsHandler` + middleware status semantics in `services/api/v1endpoints/corporations.go`.
 *
 * @param {Array<string>} accessTokenArray - Array of EVE SSO JWT tokens (strings)
 * @returns {Promise<boolean>} `true` on **204** success
 *
 * @example
 * const tokens = ["eve-sso-token-1", "eve-sso-token-2"];
 * const success = await updateCorporationClaims(tokens);
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

  try {
    const response = await requestWithPrivateHeaders(
      CLAIMS_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokens: validTokens,
        }),
      },
      { requestName: "updateCorporationClaims" }
    );

    if (!response.ok) {
      // Error responses are typically plain text from http.Error()
      const errorText = await response.text();
      console.error(`Failed to request corporation claims: ${response.status} ${response.statusText}`, errorText);
      return false;
    }

    // Endpoint returns 204 No Content on success (no body)
    return true;
  } catch (error) {
    if (error.message && error.message.includes("Authentication required")) {
      console.error("Authentication required: No server access token available");
    } else {
      console.error("Error requesting corporation claims:", error);
    }
    return false;
  }
}

export default updateCorporationClaims;