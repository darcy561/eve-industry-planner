import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const ADDITIONAL_CHARACTER_REFRESH_TOKENS_URL =
  "/api/v1/user/additional-character-refresh-tokens";

/**
 * Upserts additional-character refresh tokens via the dedicated private endpoint.
 *
 * @param {{ characterHash?: string, CharacterHash?: string, rToken?: string }[]} refreshTokens
 * @returns {Promise<boolean>}
 */
async function upsertAdditionalCharacterRefreshTokens(refreshTokens) {
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
      ADDITIONAL_CHARACTER_REFRESH_TOKENS_URL,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { requestName: "upsertAdditionalCharacterRefreshTokens" }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to upsert additional character refresh tokens: ${response.status} ${response.statusText}`,
        errorText
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error upserting additional character refresh tokens:", error);
    return false;
  }
}

/**
 * Removes specific additional-character refresh tokens from the dedicated private endpoint.
 *
 * @param {string[]} characterHashes
 * @returns {Promise<boolean>}
 */
async function deleteAdditionalCharacterRefreshTokens(characterHashes) {
  try {
    const payload = {
      characterHashes: Array.isArray(characterHashes)
        ? characterHashes.filter((hash) => typeof hash === "string" && hash.trim())
        : [],
    };

    const response = await requestWithPrivateHeaders(
      ADDITIONAL_CHARACTER_REFRESH_TOKENS_URL,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { requestName: "deleteAdditionalCharacterRefreshTokens" }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to delete additional character refresh tokens: ${response.status} ${response.statusText}`,
        errorText
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting additional character refresh tokens:", error);
    return false;
  }
}

/**
 * Loads additional-character refresh tokens from dedicated private endpoint.
 * @returns {Promise<{refreshTokens: Array}|null>}
 */
async function getAdditionalCharacterRefreshTokens() {
  try {
    const response = await requestWithPrivateHeaders(
      ADDITIONAL_CHARACTER_REFRESH_TOKENS_URL,
      {
        method: "GET",
        cache: "no-store",
      },
      { requestName: "getAdditionalCharacterRefreshTokens" }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { refreshTokens: [] };
      }
      const errorText = await response.text();
      console.error(
        `Failed to get additional character refresh tokens: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error getting additional character refresh tokens:", error);
    return null;
  }
}

export {
  upsertAdditionalCharacterRefreshTokens,
  deleteAdditionalCharacterRefreshTokens,
  getAdditionalCharacterRefreshTokens,
};
