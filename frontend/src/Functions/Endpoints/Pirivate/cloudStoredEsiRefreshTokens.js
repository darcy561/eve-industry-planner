import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const CLOUD_STORED_ESI_REFRESH_TOKENS_URL =
  "/api/v1/user/cloud-stored-esi-refresh-tokens";

/**
 * Upserts encrypted cloud-stored ESI refresh rows for linked characters (GET/PUT/DELETE via dedicated endpoint).
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
      CLOUD_STORED_ESI_REFRESH_TOKENS_URL,
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
      CLOUD_STORED_ESI_REFRESH_TOKENS_URL,
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
 * Loads cloud-stored ESI refresh metadata from the dedicated private endpoint.
 * @returns {Promise<{refreshTokens: Array}|null>}
 */
async function getCloudStoredEsiRefreshTokens() {
  try {
    const response = await requestWithPrivateHeaders(
      CLOUD_STORED_ESI_REFRESH_TOKENS_URL,
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
