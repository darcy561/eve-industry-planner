import { fetchWithPublicHeaders } from "./applyPublicHeaders.js";

/**
 * Retrieves system index data from API for specified system IDs.
 * Uses POST request to send system IDs in the request body.
 * Automatically applies public headers (X-User-Agent).
 * 
 * @param {Array<number>|Set<number>} inputArray - Array or Set of solar system IDs to get index data for
 * @returns {Promise<Object>} Promise that resolves to object with system IDs as keys
 * 
 * @example
 * const systemIndexes = await fetchSystemIndexes([30000142, 30002187]);
 * console.log(systemIndexes[30000142].Manufacturing); // Manufacturing cost index
 */
async function fetchSystemIndexes(inputArray) {
  const returnObject = {};

  if (!inputArray || (Array.isArray(inputArray) && inputArray.length === 0) || (inputArray instanceof Set && inputArray.size === 0)) {
    return returnObject;
  }

  // Convert to array and ensure IDs are strings
  const ids = Array.from(inputArray).map(id => String(id));

  if (ids.length === 0) {
    return returnObject;
  }

  const URL = `/api/v1/systemindexes/query`;

  let response;
  try {
    response = await fetchWithPublicHeaders(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ system_ids: ids }),
    });

    if (!response.ok) {
      return returnObject;
    }

    // Check if response is actually JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.error("Expected JSON response but got:", contentType);
      return returnObject;
    }

    // Parse JSON response (browser automatically handles gzip decompression)
    const responseData = await response.json();

    // Convert string keys to number keys
    if (responseData && typeof responseData === 'object') {
      for (const [key, value] of Object.entries(responseData)) {
        const numericKey = Number(key);
        if (!isNaN(numericKey)) {
          returnObject[numericKey] = value;
        }
      }
    }
  } catch (error) {
    console.error("Error fetching system indexes:", error);
    return returnObject;
  }

  return returnObject;
}

export default fetchSystemIndexes;
