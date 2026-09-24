import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * A region's market orders, for one type or for all of them.
 *
 * Naming a type is what a caller pricing one thing wants — a type's orders run
 * to a page where a whole region runs to dozens. Leaving it out is what a caller
 * reading every order in a region wants, and the two are different enough
 * requests that ESI holds them under separate etags.
 *
 * @param {Object} params - Parameters object
 * @param {number} params.regionID - EVE Online region ID
 * @param {number} [params.typeID] - EVE Online item type ID; omit for every type
 * @param {number} [params.page=1] - Page number for pagination
 * @param {Object} [params.existingData={}] - Existing data for caching
 * @param {Object} [params.config={}] - Additional configuration options
 * @returns {Promise<{data: Array, etag: string, totalPages: number,
 *   headers: Headers, unchanged: boolean}>} The orders, what identifies this
 *   answer, and the response's own headers — `expires` says when the orders can
 *   next have changed, and a caller pacing its own refresh needs it
 *
 * @throws {Error} Throws error if regionID is missing
 */
async function getMarketData({
  regionID,
  typeID,
  page = 1,
  existingData = {},
  config = {},
}) {
  try {
    // Input validation
    if (!regionID) {
      console.error("Missing required parameters:", { regionID });
      throw new Error("Missing required parameters: regionID is required");
    }

    const endpointURL =
      `https://esi.evetech.net/markets/${regionID}/orders/?datasource=tranquility&order_type=all` +
      (typeID ? `&type_id=${typeID}` : "") +
      `&page=${page}`;

    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: "normal", // Can be 'high', 'normal', 'low'
      batchable: true, // Can be batched with other requests
      maxRetries: 3, // Maximum retry attempts
      useQueue: true, // Use queue management
      ...config,
    };

    const response = await fetchWithCustomHeaders(
      endpointURL,
      {
        headers: {
          "If-None-Match": existingData?.etag || "",
        },
      },
      enhancedConfig,
    );

    if (response.status === 304) {
      return {
        data: existingData.data || [],
        etag: existingData.etag || "",
        totalPages: existingData.totalPages || 1,
        headers: response.headers,
        // Nothing has moved, so a caller holding these can keep what it has
        // and only take the new expiry from the headers above.
        unchanged: true,
      };
    }

    if (!response.ok) {
      console.error("API request failed:", {
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`,
      );
    }

    const etag = response.headers.get("etag");
    const totalPages = parseInt(response.headers.get("x-pages") || "1", 10);
    const data = await response.json();

    return {
      data,
      etag,
      totalPages,
      headers: response.headers,
      unchanged: false,
    };
  } catch (err) {
    console.error(`Error fetching market data: ${err}`);
    throw err; // Let React Query handle the error
  }
}

export default getMarketData;
