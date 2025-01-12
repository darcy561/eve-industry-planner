import fetchAllPages from "../getAllPages";

async function getMarketData(regionID, typeID) {
  try {
    if (!regionID || !typeID) {
      throw new Error("Missing RegionID");
    }
    const endpointURL = `https://esi.evetech.net/v1/markets/${regionID}/orders/?datasource=tranquility&order_type=all&type_id=${typeID}`;
    const orders = await fetchAllPages(endpointURL);

    return orders;
  } catch (err) {
    return [];
  }
}

export default getMarketData;
