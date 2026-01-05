import fetchWithCustomHeaders from "../fetchWithCustomHeaders";
import GLOBAL_CONFIG from "../../../global-config-app";

async function getCharacterJournal({
  character,
  page = 1,
  existingData = {},
  config = {}
}) {
  try {
    if (!character || !character.aToken || !character.CharacterID) {
      throw new Error("Character information is incomplete.");
    }

    const { aToken, CharacterID } = character;
    const endpointURL = `https://esi.evetech.net/v6/characters/${CharacterID}/wallet/journal/?datasource=tranquility&page=${page}`;
    const refTypes = new Set([
      "brokers_fee",
      "market_escrow",
      "market_transaction",
      "transaction_tax",
    ]);

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
        console.warn(`Access forbidden for character journal: ${CharacterID}`);
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

    const currentDate = Date.now();
    data = data
      .filter(
        (item) =>
          currentDate - Date.parse(item.date) <=
            GLOBAL_CONFIG.ESI_DATE_PERIOD * 24 * 60 * 60 * 1000 &&
          refTypes.has(item.ref_type)
      )
      .map((entry) => ({
        ...entry,
        character_id: CharacterID,
      }));

    return {
      data,
      etag,
      totalPages,
    };

  } catch (err) {
    console.error(`Error fetching character journal: ${err}`);
    return {
      data: [],
      etag: "",
      totalPages: 1,
    };
  }
}

export default getCharacterJournal;
