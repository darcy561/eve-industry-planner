import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * Fetches market history data for a specific item in a region from EVE ESI API.
 * Returns historical price and volume data for the specified item and region.
 * 
 * @param {Object} params - Parameters object
 * @param {number} params.regionID - EVE Online region ID
 * @param {number} params.typeID - EVE Online item type ID
 * @param {Object} [params.existingData={}] - Existing data for caching with ETag support
 * @param {Object} [params.config={}] - Additional configuration options
 * @returns {Promise<Object>} Promise that resolves to market history data with etag
 * 
 * @throws {Error} Throws error if regionID or typeID is missing
 * 
 * @example
 * const history = await getMarketHistory({
 *   regionID: 10000002,
 *   typeID: 34,
 *   existingData: { etag: "previous-etag" }
 * });
 * console.log(history.data); // Array of historical price data
 */
async function getMarketHistory({ regionID, typeID, existingData, config = {} }) {
  try {
    if (!regionID || !typeID) {
      throw new Error("Missing Input Information");
    }

    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: 'normal',
      batchable: true,
      maxRetries: 3,
      useQueue: true,
      group: 'market',
      ...config
    };

    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/markets/${regionID}/history/?datasource=tranquility&type_id=${typeID}`,
      {
        headers: {
          "If-None-Match": existingData?.etag || null,
        },
      },
      enhancedConfig
    );

    if (response.status === 304) {
      return {
        data: existingData?.data || [],
        etag: existingData?.etag || "",
      };
    }

    if (!response.ok) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    const etag = response.headers.get("etag");
    const data = await response.json();

    return { data, etag };
  } catch (err) {
    console.error(`Error fetching market history: ${err}`);
    return {
      data: existingData?.data || [],
      etag: existingData?.etag || "",
    };
  }
}

export default getMarketHistory;
