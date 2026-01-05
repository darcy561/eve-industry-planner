import { getToken } from "firebase/app-check";
import { appCheck } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import { getRuntimeEnv } from "../../utils/runtime-config";

/**
 * Retrieves system index data from Firebase API for specified system IDs.
 * Handles both single system requests and batch requests for multiple systems.
 * 
 * @param {Array<number>} inputArray - Array of solar system IDs to get index data for
 * @returns {Promise<Object>} Promise that resolves to object with system IDs as keys
 * 
 * @example
 * const systemIndexes = await getSystemIndexDataFromFirebase([30000142, 30002187]);
 * console.log(systemIndexes[30000142].cost_index); // Manufacturing cost index
 */
async function getSystemIndexDataFromFirebase(inputArray) {
  if (!inputArray || inputArray.length === 0) {
    return returnObject;
  }
  let URL = `${getRuntimeEnv("API_URL")}/system-indexes`;
  let isSingleItem = inputArray.size === 1;
  let returnObject = {};

  const appCheckToken = await getToken(appCheck);

  if (inputArray.size === 1) {
    URL += `/${inputArray[0]}`;
  }

  const response = await fetch(URL, {
    method: isSingleItem ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Firebase-AppCheck": appCheckToken.token,
      accountID: getCurrentFirebaseUser(),
      appVersion: __APP_VERSION__,
    },
    body: !isSingleItem ? JSON.stringify({ idArray: inputArray }) : undefined,
  });

  if (!response.ok) {
    return returnObject;
  }

  const responseData = await response.json();

  if (Array.isArray(responseData)) {
    responseData.forEach((entry) => {
      returnObject[entry.solar_system_id] = entry;
    });
  } else {
    returnObject[responseData.solar_system_id] = responseData;
  }

  return returnObject;
}

export default getSystemIndexDataFromFirebase;
