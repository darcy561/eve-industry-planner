import { fetchWithPublicHeaders } from "./Public/applyPublicHeaders.js";
import requestWithPrivateHeaders from "./Private/applyPrivateHeaders.js";

const ESI_ACCESS_TOKEN_SERVER = "/api/v1/esi/characters/access-token/server";
const EVE_SSO_TOKENS_REFRESH = "/api/v1/eve-sso/tokens/refresh";

/**
 * ESI access JWT using Mongo-held OAuth refresh (server storage mode).
 * `POST /api/v1/esi/characters/access-token/server`
 */
export async function requestEsiAccessFromServerStorage(characterHash) {
  const response = await requestWithPrivateHeaders(
    ESI_ACCESS_TOKEN_SERVER,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character_hash: characterHash }),
    },
    { requestName: "requestEsiAccessFromServerStorage" }
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Server-stored ESI access refresh failed: ${response.status} ${response.statusText} ${errText}`
    );
  }
  return response.json();
}

/**
 * ESI access JWT using client-held OAuth refresh (`POST /api/v1/eve-sso/tokens/refresh`).
 */
export async function requestEsiAccessFromClientRefreshSecret(refreshToken) {
  if (!refreshToken || !String(refreshToken).trim()) {
    throw new Error("Refresh token is required for client ESI access refresh");
  }
  const response = await fetchWithPublicHeaders(
    EVE_SSO_TOKENS_REFRESH,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
    { requestName: "requestEsiAccessFromClientRefreshSecret" }
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error ||
        `API request failed with status ${response.status}: ${response.statusText}`
    );
  }
  return response.json();
}
