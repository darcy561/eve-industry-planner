import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * Fetches character market orders from EVE ESI API with pagination and caching support.
 * Filters out buy orders and only returns sell orders.
 * 
 * @param {Object} params - Parameters object
 * @param {Object} params.character - Character object with esiAccessToken, CharacterID, and CharacterHash
 * @param {number} [params.page=1] - Page number for pagination
 * @param {Object} [params.existingData={}] - Existing data for caching
 * @param {Object} [params.config={}] - Additional configuration options
 * @returns {Promise<Object>} Promise that resolves to market orders data with etag and totalPages
 * 
 * @example
 * const orders = await getCharacterMarketOrders({
 *   character: { esiAccessToken: "token", CharacterID: 123456, CharacterHash: "hash" },
 *   page: 1,
 *   config: { characterHash: "hash" }
 * });
 */
async function getCharacterMarketOrders({
  character,
  page = 1,
  existingData = {},
  config = {}
}) {
  try {
    if (!character || !character.esiAccessToken || !character.CharacterID) {
      throw new Error("Character information is incomplete.");
    }

    const { esiAccessToken, CharacterID } = character;
    const endpointURL = `https://esi.evetech.net/characters/${CharacterID}/orders/?datasource=tranquility&page=${page}`;

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
          Authorization: `Bearer ${esiAccessToken}`,
        },
      },
      enhancedConfig
    );

    // Helper to return default response structure
    const getDefaultResponse = (data = existingData.data || []) => ({
      data,
      etag: existingData.etag || "",
      totalPages: existingData?.totalPages || 1,
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
          `Access forbidden for character market orders: ${CharacterID}`
        );
        return {
          data: [],
          etag: "",
          totalPages: existingData?.totalPages || 1,
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

    data = data
      .filter((item) => !item.is_buy_order)
      .map((order) => ({
        ...order,
        CharacterHash: character.CharacterHash,
        character_id: CharacterID,
        is_corporation: false,
      }));

    return {
      data,
      etag,
      totalPages,
    };
  } catch (err) {
    console.error(`Error fetching character market orders: ${err}`);
    return {
      data: [],
      etag: "",
      totalPages: existingData?.totalPages || 1,
    };
  }
}

export default getCharacterMarketOrders;
