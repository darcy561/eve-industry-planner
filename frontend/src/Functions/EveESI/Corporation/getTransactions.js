import GLOBAL_CONFIG from "../../../global-config-app";
import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

async function getCorpTransactions({ character, existingData = {}, config = {} }) {
  try {
    if (!character || !character.aToken || !character.corporation_id) {
      throw new Error("Character information is incomplete.");
    }
    const { aToken, corporation_id } = character;
    const { ESI_DATE_PERIOD } = GLOBAL_CONFIG;
    const maxDivisions = 7;
    const currentDate = Date.now();

    async function fetchAndFilterDivisionTransactions(division) {
      try {
        const endpointURL = `https://esi.evetech.net/v1/corporations/${corporation_id}/wallets/${division}/transactions`;
        // Enhanced configuration for rate limiting
        const enhancedConfig = {
          priority: 'normal',
          batchable: true,
          maxRetries: 3,
          useQueue: true,
          group: 'corporation',
          characterHash: config.characterHash,
          ...config
        };

        const response = await fetchWithCustomHeaders(
          endpointURL,
          {
            headers: {
              "If-None-Match": existingData[division]?.eTags || "",
              Authorization: `Bearer ${aToken}`,
            },
          },
          enhancedConfig
        );

        // Helper to return default response structure
        const getDefaultResponse = (data = existingData[division]?.data || []) => ({
          data,
          eTags: existingData[division]?.eTags || {},
          division,
        });

        // Handle cached/not modified responses
        if (response.status === 304) {
          return getDefaultResponse();
        }

        // Handle no content responses (204)
        if (response.status === 204) {
          return {
            data: [],
            eTags: "",
            division,
            totalPages: parseInt(response.headers.get("x-pages") || "1", 10),
          };
        }

        // Handle client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          // Permission errors - return empty data gracefully
          if (response.status === 403) {
            console.warn(
              `Access forbidden for corporation transactions: ${corporation_id}`
            );
            return {
              data: [],
              eTags: "",
              division,
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
        let data = await response.json();
        const eTags = response.headers.get("etag");

        data = data
          .filter(
            (item) =>
              currentDate - Date.parse(item.date) <=
                ESI_DATE_PERIOD * 24 * 60 * 60 * 1000 && !item.is_buy
          )
          .map((transaction) => ({
            ...transaction,
            corporation_id: corporation_id,
            division: division,
          }));

        return {
          data,
          eTags,
          division,
        };
      } catch (err) {
        console.error(
          `Error fetching transactions for division ${division}: ${err}`
        );
        return { division, data: [] };
      }
    }

    const divisionPromises = Array.from({ length: maxDivisions }, (_, i) =>
      fetchAndFilterDivisionTransactions(i + 1)
    );

    const transactions = await Promise.all(divisionPromises);

    return {
      data: transactions,
    };
  } catch (err) {
    console.error(`Error fetching corporation transactions: ${err}`);
    return [];
  }
}

export default getCorpTransactions;
  