import { fetchWithPublicHeaders } from "./applyPublicHeaders.js";
import { MAX_BATCH_SYSTEM_OR_TYPE_IDS } from "./apiLimits.js";

/**
 * Retrieves market price data from API for specified type IDs.
 * Uses POST request to send type IDs in the request body.
 * Automatically applies public headers (X-User-Agent).
 *
 * Retries: `fetchWithPublicHeaders` (408 / 429 / 5xx). Handler: `MarketPricesHandler` (`services/api/v1endpoints/marketPrices.go`).
 * 
 * @param {Array<number>|Set<number>} inputArray - Array or Set of type IDs to get market prices for
 * @returns {Promise<Object>} Promise that resolves to object with type IDs as keys
 * 
 * @example
 * const marketPrices = await fetchMarketPrices([34, 35, 36]);
 * console.log(marketPrices[34].adjustedPrice); // Adjusted price
 */
async function fetchMarketPrices(inputArray) {
  const returnObject = {};

  if (!inputArray || (Array.isArray(inputArray) && inputArray.length === 0) || (inputArray instanceof Set && inputArray.size === 0)) {
    return returnObject;
  }

  // Convert to array and ensure IDs are strings
  const ids = Array.from(inputArray).map(id => String(id));

  if (ids.length === 0) {
    return returnObject;
  }

  const URL = `/api/v1/marketprices/query`;

  try {
    const chunks = [];
    for (let i = 0; i < ids.length; i += MAX_BATCH_SYSTEM_OR_TYPE_IDS) {
      chunks.push(ids.slice(i, i + MAX_BATCH_SYSTEM_OR_TYPE_IDS));
    }

    const mergeChunk = async (chunkIds) => {
      const response = await fetchWithPublicHeaders(
        URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ typeIDs: chunkIds }),
        },
        { requestName: "fetchMarketPrices" }
      );

      if (!response.ok) {
        return;
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Expected JSON response but got:", contentType);
        return;
      }

      const responseData = await response.json();
      if (responseData && typeof responseData === "object") {
        for (const [key, value] of Object.entries(responseData)) {
          const numericKey = Number(key);
          if (!isNaN(numericKey)) {
            returnObject[numericKey] = value;
          }
        }
      }
    };

    await Promise.all(chunks.map((chunk) => mergeChunk(chunk)));
  } catch (error) {
    console.error("Error fetching market prices:", error);
    return returnObject;
  }
  return returnObject;
}

export default fetchMarketPrices;
