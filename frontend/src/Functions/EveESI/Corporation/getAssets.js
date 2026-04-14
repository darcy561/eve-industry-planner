import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * Fetches corporation assets from EVE ESI API with pagination and caching support.
 * Requires character to have corporation access permissions.
 * 
 * @param {Object} params - Parameters object
 * @param {Object} params.character - Character object with esiAccessToken and corporation_id
 * @param {number} [params.page=1] - Page number for pagination
 * @param {Object} [params.existingEtags={}] - Existing ETags for caching
 * @param {Object} [params.config={}] - Additional configuration options
 * @returns {Promise<Object>} Promise that resolves to assets data with etag and totalPages
 * 
 * @example
 * const assets = await getCorpAssets({
 *   character: { esiAccessToken: "token", corporation_id: 123456 },
 *   page: 1,
 *   config: { characterHash: "hash" }
 * });
 */
async function getCorpAssets({ character, page = 1, existingEtags = {}, config = {} }) {
  try {
    if (!character || !character.esiAccessToken || !character.corporation_id) {
      throw new Error("Character information is incomplete.");
    }
    const { esiAccessToken, corporation_id } = character;
    const endpointURL = `https://esi.evetech.net/v5/corporations/${corporation_id}/assets/?datasource=tranquility&page=${page}`;

    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: 'normal',
      batchable: true,
      maxRetries: 3,
      useQueue: true,
      group: 'assets',
      characterHash: config.characterHash,
      ...config
    };

    const response = await fetchWithCustomHeaders(
      endpointURL,
      {
        headers: {
          "If-None-Match": existingEtags?.etag || "",
          Authorization: `Bearer ${esiAccessToken}`,
        },
      },
      enhancedConfig
    );

    // Helper to return default response structure
    const getDefaultResponse = (data = existingEtags.data || []) => ({
      data,
      etag: existingEtags.etag || "",
      totalPages: existingEtags.totalPages || 1,
    });

    // Handle cached/not modified responses
    if (response.status === 304) {
      return getDefaultResponse();
    }

    // Handle no content responses (204)
    if (response.status === 204) {
      return {
        data: [],
        etag: response.headers.get("etag") || "",
        totalPages: parseInt(response.headers.get("x-pages") || "1", 10),
      };
    }

    // Handle client errors (4xx)
    if (response.status >= 400 && response.status < 500) {
      // Permission errors - return empty data gracefully
      if (response.status === 403) {
        console.warn(
          `Access forbidden for corporation assets: ${corporation_id}`
        );
        return {
          data: [],
          etag: "",
          totalPages: 1,
        };
      }
      // Other client errors - throw
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    // Handle server errors (5xx)
    if (response.status >= 500) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    // Handle successful responses (2xx with body)
    const etag = response.headers.get("etag");
    const totalPages = parseInt(response.headers.get("x-pages") || "1", 10);
    let data = await response.json();

    return { data, etag, totalPages };
  } catch (err) {
    console.error(`Error fetching corporation assets: ${err}`);
    return {
      data: [],
      etag: "",
      totalPages: 1,
    };
  }
}

export default getCorpAssets;
