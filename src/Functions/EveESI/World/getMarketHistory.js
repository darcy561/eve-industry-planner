async function getMarketHistory(regionID, typeID) {
  try {
    if (!regionID || !typeID) {
      throw new Error("Missing Input Information");
    }

    const response = await fetch(
      `https://esi.evetech.net/v1/markets/${regionID}/history/?datasource=tranquility&type_id=${typeID}`
    );
    if (!response.ok) {
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    return response.json();
  } catch (err) {
    return err;
  }
}

export default getMarketHistory;
