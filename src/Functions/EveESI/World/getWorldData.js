import { STATIONID_RANGE } from "../../../Context/defaultValues";
import getCitadelData from "./getCitadelData";
import getUniverseNames from "./getUniverseNames";

async function getWorldData(inputIDs, userObj) {
  try {
    if (!inputIDs || !userObj) {
      throw new Error("Input information is incomplete");
    }

    if (!(inputIDs instanceof Array || inputIDs instanceof Set)) {
      throw new Error("Input needs to be an Array or Set.");
    }

    const chunkSize = 1000;
    const promises = [];
    const locationSplit = { citadels: [], standard: [] };

    inputIDs.forEach((id) => {
      if (id.toString().length > 10) {
        locationSplit.citadels.push(id);
      } else {
        locationSplit.standard.push(id);
      }
    });
    console.log(locationSplit);
    for (let i = 0; i < locationSplit.standard.length; i += chunkSize) {
      const chunk = locationSplit.standard.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;
      promises.push(getUniverseNames(chunk));
    }

    for (let id of locationSplit.citadels) {
      promises.push(getCitadelData(id, userObj));
    }

    const responses = (await Promise.all(promises)).flat();

    const returnObject = {};

    responses.forEach((obj) => {
      if (!obj) return;
      returnObject[obj.id] = obj;
    });
    return returnObject;
  } catch (err) {
    console.error(`Error in getWorldData: ${err}`);
    return {};
  }
}

export default getWorldData;
