import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * Fetches character blueprints from EVE ESI API with pagination and caching support.
 * 
 * @param {Object} params - Parameters object
 * @param {Object} params.character - Character object with aToken, CharacterID, and CharacterHash
 * @param {number} [params.page=1] - Page number for pagination
 * @param {Object} [params.existingData={}] - Existing data for caching
 * @param {Object} [params.config={}] - Additional configuration options
 * @returns {Promise<Object>} Promise that resolves to blueprints data with etag and totalPages
 * 
 * @example
 * const blueprints = await getCharacterBlueprints({
 *   character: { aToken: "token", CharacterID: 123456, CharacterHash: "hash" },
 *   page: 1,
 *   config: { characterHash: "hash" }
 * });
 */
async function getCharacterBlueprints({
  character,
  page = 1,
  existingData = {},
  config = {}
}) {
  try {
    if (
      !character ||
      !character.aToken ||
      !character.CharacterID ||
      !character.CharacterHash
    ) {
      throw new Error("Character information is incomplete.");
    }

    const { aToken, CharacterID, CharacterHash } = character;
    const endpointURL = `https://esi.evetech.net/v3/characters/${CharacterID}/blueprints/?datasource=tranquility&page=${page}`;

    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: 'normal',
      batchable: true,
      maxRetries: 3,
      useQueue: true,
      group: 'character',
      characterHash: config.characterHash,
      ...config
    };

    const response = await fetchWithCustomHeaders(
      endpointURL,
      {
        headers: {
          "If-None-Match": existingData?.etag || "",
          Authorization: `Bearer ${aToken}`,
        },
      },
      enhancedConfig
    );

    // Helper to return default response structure
    const getDefaultResponse = (data = existingData.data || []) => ({
      data,
      etag: existingData.etag || "",
      totalPages: existingData.totalPages || 1,
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
        console.warn(`Access forbidden for character blueprints: ${CharacterID}`);
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

    data = data.map(blueprint => ({
      ...blueprint,
      CharacterHash,
      is_corporation: false,
      character_id: CharacterID,
    }));

    return {
      data,
      etag,
      totalPages,
    };

  } catch (err) {
    console.error(`Error fetching character blueprints: ${err}`);
    return {
      data: [],
      etag: "",
      totalPages: 1,
    };
  }
}

export default getCharacterBlueprints;
