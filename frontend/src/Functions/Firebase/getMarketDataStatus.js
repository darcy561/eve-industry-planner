import { getToken } from "firebase/app-check";
import { appCheck } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import { getRuntimeEnv } from "../../utils/runtime-config";

/**
 * Retrieves processing status for specified item IDs from Firebase API.
 * Checks whether items are still being processed or are ready for data retrieval.
 * 
 * @param {Array<string|number>} inputArray - Array of item IDs to check status for
 * @returns {Promise<Array>} Promise that resolves to array of status objects
 * 
 * @throws {Error} Throws error if inputArray is missing or API request fails
 * 
 * @example
 * const statusData = await getMarketDataStatusFromFirebase([34, 35, 36]);
 * console.log(statusData); // Array of status objects with 'ready' or 'processing'
 */
async function getMarketDataStatusFromFirebase(inputArray) {
  try {
    if (!inputArray) {
      throw new Error("missing status input array");
    }

    const appCheckToken = await getToken(appCheck);
    const response = await fetch(`${getRuntimeEnv("API_URL")}/market-data/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Firebase-AppCheck": appCheckToken.token,
        accountID: getCurrentFirebaseUser(),
        appVersion: __APP_VERSION__,
      },
      body: JSON.stringify({
        idArray: inputArray,
      }),
    });
    
    if (!response.ok) {
      throw new Error(
        `Status API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error retrieving market data status: ${err}`);
    return [];
  }
}

export default getMarketDataStatusFromFirebase;
