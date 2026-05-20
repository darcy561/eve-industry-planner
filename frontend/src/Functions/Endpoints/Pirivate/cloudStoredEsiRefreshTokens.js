import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const OAUTH_CREDENTIALS_URL =
  "/api/v1/user/linked-characters/oauth-credentials";

/**
 * Cloud OAuth refresh material is stored encrypted server-side. PUT uploads secrets once (e.g. login/link flows).
 * GET returns linked character hashes only — use `POST /api/v1/esi/characters/access-token/server` for ESI access tokens.
 *
 * @param {{ characterHash?: string, CharacterHash?: string, rToken?: string }[]} refreshTokens
 * @returns {Promise<boolean>}
 */
async function upsertCloudStoredEsiRefreshTokens(refreshTokens) {
  try {
    const payload = {
      refreshTokens: Array.isArray(refreshTokens)
        ? refreshTokens.map((token) => ({
            characterHash: token?.CharacterHash || token?.characterHash || "",
            rToken: token?.rToken || "",
          }))
        : [],
    };

    const response = await requestWithPrivateHeaders(
      OAUTH_CREDENTIALS_URL,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { requestName: "upsertCloudStoredEsiRefreshTokens" }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to upsert cloud-stored ESI refresh tokens: ${response.status} ${response.statusText}`,
        errorText
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error upserting cloud-stored ESI refresh tokens:", error);
    return false;
  }
}

/**
 * Removes cloud-stored ESI refresh rows for the given character hashes.
 *
 * @param {string[]} characterHashes
 * @returns {Promise<boolean>}
 */
async function deleteCloudStoredEsiRefreshTokens(characterHashes) {
  try {
    const payload = {
      characterHashes: Array.isArray(characterHashes)
        ? characterHashes.filter((hash) => typeof hash === "string" && hash.trim())
        : [],
    };

    const response = await requestWithPrivateHeaders(
      OAUTH_CREDENTIALS_URL,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { requestName: "deleteCloudStoredEsiRefreshTokens" }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to delete cloud-stored ESI refresh tokens: ${response.status} ${response.statusText}`,
        errorText
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting cloud-stored ESI refresh tokens:", error);
    return false;
  }
}

/**
 * Loads linked character hashes for cloud accounts (`refreshTokens[].characterHash`; no OAuth secrets).
 * @returns {Promise<{refreshTokens: Array}|null>}
 */
async function getCloudStoredEsiRefreshTokens() {
  try {
    const response = await requestWithPrivateHeaders(
      OAUTH_CREDENTIALS_URL,
      {
        method: "GET",
        cache: "no-store",
      },
      { requestName: "getCloudStoredEsiRefreshTokens" }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { refreshTokens: [] };
      }
      const errorText = await response.text();
      console.error(
        `Failed to get cloud-stored ESI refresh tokens: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error getting cloud-stored ESI refresh tokens:", error);
    return null;
  }
}

export {
  upsertCloudStoredEsiRefreshTokens,
  deleteCloudStoredEsiRefreshTokens,
  getCloudStoredEsiRefreshTokens,
};
