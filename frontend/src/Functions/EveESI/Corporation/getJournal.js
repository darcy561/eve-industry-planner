import fetchWithCustomHeaders from "../fetchWithCustomHeaders";
import GLOBAL_CONFIG from "../../../global-config-app";

async function getCorpJournal({
  character,
  division,
  page = 1,
  existingData = {},
  config = {},
}) {
  try {
    if (!character || !character.esiAccessToken || !character.corporation_id) {
      throw new Error("Character information is incomplete.");
    }

    const { esiAccessToken, corporation_id } = character;
    const endpointURL = `https://esi.evetech.net/v4/corporations/${corporation_id}/wallets/${division}/journal/?datasource=tranquility&page=${page}`;

    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: "normal",
      batchable: true,
      maxRetries: 3,
      useQueue: true,
      group: "corporation",
      characterHash: config.characterHash,
      ...config,
    };

    const response = await fetchWithCustomHeaders(
      endpointURL,
      {
        headers: {
          "If-None-Match": existingData?.etag?.[division]?.[page] ?? "",
          Authorization: `Bearer ${esiAccessToken}`,
        },
      },
      enhancedConfig
    );

    // Helper to return default response structure
    const getDefaultResponse = (data = existingData.data || []) => ({
      data,
      etag: existingData.etag?.[division]?.[page] ?? "",
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
      // Permission errors - return existing data gracefully
      if (response.status === 403) {
        console.warn(
          `Access forbidden for corporation journal: ${corporation_id}`
        );
        return getDefaultResponse();
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
    // At this point, response.ok should be true and we've handled 204
    const etag = response.headers.get("etag");
    const totalPages = parseInt(response.headers.get("x-pages") || "1", 10);

    // Parse JSON body (should exist for successful 2xx responses except 204)
    let data = await response.json();

    const currentDate = Date.now();
    const refTypes = new Set([
      "brokers_fee",
      "market_escrow",
      "market_transaction",
      "transaction_tax",
    ]);

    data = data
      .filter(
        (item) =>
          currentDate - Date.parse(item.date) <=
            GLOBAL_CONFIG.ESI_DATE_PERIOD * 24 * 60 * 60 * 1000 &&
          refTypes.has(item.ref_type)
      )
      .map((entry) => ({
        ...entry,
        corporation_id,
        division,
      }));

    return {
      data,
      etag,
      totalPages,
    };
  } catch (err) {
    console.error(`Error fetching corporation journal: ${err}`);
    return {
      data: existingData.data || [],
      etag: existingData.etag?.[division]?.[page] ?? "",
      totalPages: existingData.totalPages || 1,
    };
  }
}

export default getCorpJournal;
