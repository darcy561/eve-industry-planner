import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * Fetches market data for a specific item in a region from EVE ESI API.
 * 
 * @param {Object} params - Parameters object
 * @param {number} params.regionID - EVE Online region ID
 * @param {number} params.typeID - EVE Online item type ID
 * @param {number} [params.page=1] - Page number for pagination
 * @param {Object} [params.existingData={}] - Existing data for caching
 * @param {Object} [params.config={}] - Additional configuration options
 * @returns {Promise<Object>} Promise that resolves to market data with etag and totalPages
 * 
 * @throws {Error} Throws error if regionID or typeID is missing
 * 
 * @example
 * const marketData = await getMarketData({
 *   regionID: 10000002,
 *   typeID: 34,
 *   page: 1
 * });
 */
async function getMarketData({
  regionID,
  typeID,
  page = 1,
  existingData = {},
  config = {}
}) {
  try {
    // Input validation
    if (!regionID || !typeID) {
      console.error("Missing required parameters:", { regionID, typeID });
      throw new Error(
        "Missing required parameters: regionID and typeID are required"
      );
    }

    const endpointURL = `https://esi.evetech.net/v1/markets/${regionID}/orders/?datasource=tranquility&order_type=all&type_id=${typeID}&page=${page}`;

    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: 'normal', // Can be 'high', 'normal', 'low'
      batchable: true,     // Can be batched with other requests
      maxRetries: 3,       // Maximum retry attempts
      useQueue: true,      // Use queue management
      ...config
    };

    const response = await fetchWithCustomHeaders(endpointURL, {
      headers: {
        "If-None-Match": existingData?.etag || "",
      },
    }, enhancedConfig);

    if (response.status === 304) {
      return {
        data: existingData.data || [],
        etag: existingData.etag || "",
        totalPages: existingData.totalPages || 1,
      };
    }

    if (!response.ok) {
      console.error("API request failed:", {
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    const etag = response.headers.get("etag");
    const totalPages = parseInt(response.headers.get("x-pages") || "1", 10);
    const data = await response.json();

    return {
      data,
      etag,
      totalPages,
    };
  } catch (err) {
    console.error(`Error fetching market data: ${err}`);
    throw err; // Let React Query handle the error
  }
}

export default getMarketData;
