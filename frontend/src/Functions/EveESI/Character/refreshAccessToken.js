import { requestEsiAccessFromClientRefreshSecret } from "../../Endpoints/esiAccessClient.js";

/**
 * Client-held OAuth refresh → ESI access JWT via `POST /api/v1/eve-sso/tokens/refresh`.
 * Returns an {@link Error} on failure (legacy call sites expect `instanceof Error`, not thrown errors).
 *
 * @param {string} refreshToken
 * @returns {Promise<object|Error>}
 */
async function refreshEsiAccessTokenViaSsoRefreshEndpoint(refreshToken) {
  try {
    return await requestEsiAccessFromClientRefreshSecret(refreshToken);
  } catch (err) {
    console.error(`Error refreshing access token: ${err}`);
    return err instanceof Error ? err : new Error(String(err));
  }
}

export default refreshEsiAccessTokenViaSsoRefreshEndpoint;
