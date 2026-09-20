import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

/**
 * What ESI says about a constellation, including the region holding it.
 *
 * @param {number|string} constellationID
 * @returns {Promise<Object|null>} The constellation, or null when it could not be read
 */
async function getConstellationData(constellationID) {
  try {
    if (!constellationID) {
      throw new Error("Input information is incomplete");
    }
    if (
      typeof constellationID !== "string" &&
      typeof constellationID !== "number"
    ) {
      console.error(
        "Invalid input: constellationID must be a string or number.",
      );
      return null;
    }
    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/universe/constellations/${constellationID}/?datasource=tranquility`,
    );

    if (!response.ok) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error retrieving constellation data: ${err}`);
    return null;
  }
}
export default getConstellationData;
