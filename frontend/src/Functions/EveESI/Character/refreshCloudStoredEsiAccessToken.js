import { requestWithPrivateHeaders } from "../../Endpoints/Pirivate/applyPrivateHeaders.js";

/**
 * Server-side ESI access-token refresh for cloud-linked characters (main or alt).
 * Uses Mongo-stored ESI refresh material; no ESI refresh token is returned to the client.
 * @param {string} characterHash
 * @returns {Promise<{ access_token: string, token_type: string, expires_in: number }|Error>}
 */
export default async function refreshCloudStoredEsiAccessToken(characterHash) {
  try {
    const response = await requestWithPrivateHeaders(
      "/api/v1/eve-sso/cloud-stored-esi/refresh",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          character_hash: characterHash,
        }),
      },
      { requestName: "refreshCloudStoredEsiAccessToken" }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return new Error(
        errText || `Cloud stored ESI refresh failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error refreshing cloud stored ESI access token: ${err}`);
    return err instanceof Error ? err : new Error(String(err));
  }
}
