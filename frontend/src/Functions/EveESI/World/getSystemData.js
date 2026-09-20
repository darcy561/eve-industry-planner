import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * What ESI says about a solar system, including the constellation holding it.
 *
 * @param {number|string} systemID
 * @returns {Promise<Object|null>} The system, or null when it could not be read
 */
async function getSystemData(systemID) {
  try {
    if (!systemID) {
      throw new Error("Input information is incomplete");
    }
    if (typeof systemID !== "string" && typeof systemID !== "number") {
      console.error("Invalid input: systemID must be a string or number.");
      return null;
    }
    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/universe/systems/${systemID}/?datasource=tranquility`,
    );

    if (!response.ok) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error retrieving system data: ${err}`);
    return null;
  }
}
export default getSystemData;
