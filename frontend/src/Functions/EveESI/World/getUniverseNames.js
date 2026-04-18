import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * Retrieves universe names for location IDs from EVE ESI API.
 * 
 * @param {Array|Set} requestedLocationIDs - Array or Set of location IDs to get names for
 * @param {Object} [config={}] - Additional configuration options
 * @returns {Promise<Object>} Promise that resolves to object mapping IDs to names
 * 
 * @throws {Error} Throws error if requestedLocationIDs is missing or not an Array/Set
 * 
 * @example
 * const names = await getUniverseNames([30000142, 30002187]);
 * console.log(names); // { 30000142: { id: 30000142, name: "Jita", category: "solar_system" } }
 */
async function getUniverseNames(requestedLocationIDs, config = {}) {
  try {
    if (!requestedLocationIDs) {
      throw new Error("Input information is incomplete.");
    }
    if (
      !Array.isArray(requestedLocationIDs) &&
      !(requestedLocationIDs instanceof Set)
    ) {
      throw new Error("Input needs to be an Array or Set.");
    }

    const locationIDsArray = Array.isArray(requestedLocationIDs)
      ? requestedLocationIDs
      : [...requestedLocationIDs];

    // Enhanced configuration for rate limiting
    const enhancedConfig = {
      priority: 'normal',
      batchable: true,
      maxRetries: 3,
      useQueue: true,
      group: 'universe',
      ...config
    };

    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/universe/names/?datasource=tranquility`,
      {
        method: "POST",
        body: JSON.stringify(locationIDsArray),
      },
      enhancedConfig
    );

    if (!response.ok) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error retrieving universe data: ${err}`);
    return {};
  }
}

export default getUniverseNames;
