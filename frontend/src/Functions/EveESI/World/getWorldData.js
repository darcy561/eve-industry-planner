import { STATIONID_RANGE } from "../../../Context/defaultValues";
import getCitadelData from "./getCitadelData";
import getUniverseNames from "./getUniverseNames";
import useUsersStore from "../../../Zustand/usersStore";

async function getWorldData(inputIDs, userObj, config = {}) {
  try {
    const returnObject = {};
    
    if (!inputIDs || !userObj) {
      throw new Error("Input information is incomplete");
    }
    
    if (!(inputIDs instanceof Array || inputIDs instanceof Set)) {
      throw new Error("Input needs to be an Array or Set.");
    }
    
    if (inputIDs.length === 0 || inputIDs.size === 0) {
      return returnObject;
    }
    // Filter out IDs that already exist in the worldData store
    const existingUniverseIDs = useUsersStore.getState().worldData.universeIDs;
    const filteredIDs = Array.isArray(inputIDs)
      ? inputIDs.filter((id) => !existingUniverseIDs[id])
      : Array.from(inputIDs).filter((id) => !existingUniverseIDs[id]);

    if (filteredIDs.length === 0) {
      return returnObject;
    }

    const chunkSize = 1000;
    const promises = [];
    const locationSplit = { citadels: [], standard: [] };

    filteredIDs.forEach((id) => {
      if (id.toString().length > 10) {
        locationSplit.citadels.push(id);
      } else {
        locationSplit.standard.push(id);
      }
    });

    for (let i = 0; i < locationSplit.standard.length; i += chunkSize) {
      const chunk = locationSplit.standard.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;
      promises.push(getUniverseNames(chunk, config));
    }

    for (let id of locationSplit.citadels) {
      promises.push(getCitadelData(id, userObj));
    }

    const responses = (await Promise.all(promises)).flat();



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
