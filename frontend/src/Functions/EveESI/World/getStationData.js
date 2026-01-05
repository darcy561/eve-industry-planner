import fetchWithCustomHeaders from "../fetchWithCustomHeaders";

async function getStationData(stationID) {
  try {
    if (!stationID) {
      throw new Error("Input information is incomplete");
    }
    if (typeof stationID !== "string" && typeof stationID !== "number") {
      console.error("Invalid input: stationID must be a string or number.");
      return null;
    }
    const response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/v2/universe/stations/${stationID}`
    );

    if (!response.ok) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error retrieving station data: ${err}`);
    return null;
  }
}
export default getStationData;
