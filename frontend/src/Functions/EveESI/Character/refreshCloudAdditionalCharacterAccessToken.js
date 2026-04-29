import { requestWithPrivateHeaders } from "../../Endpoints/Pirivate/applyPrivateHeaders.js";

/**
 * Server-side ESI refresh for a cloud-linked additional character (no refresh token returned).
 * @param {string} characterHash
 * @returns {Promise<{ access_token: string, token_type: string, expires_in: number }|Error>}
 */
export default async function refreshCloudAdditionalCharacterAccessToken(characterHash) {
  try {
    const response = await requestWithPrivateHeaders(
      "/api/v1/eve-sso/additional-characters/refresh",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          character_hash: characterHash,
        }),
      },
      { requestName: "refreshCloudAdditionalCharacterAccessToken" }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return new Error(
        errText || `Cloud ESI refresh failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error refreshing cloud additional character access token: ${err}`);
    return err instanceof Error ? err : new Error(String(err));
  }
}
