import { getToken } from "firebase/app-check";
import { appCheck } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import { getRuntimeEnv } from "../../utils/runtime-config";

/**
 * Retrieves market data for specified item IDs from Firebase API.
 * Makes authenticated requests to the backend API with App Check token validation.
 * 
 * @param {Array<string|number>} inputArray - Array of item IDs to fetch market data for
 * @returns {Promise<Array|Object>} Promise that resolves to market data array or object
 * 
 * @throws {Error} Throws error if inputArray is missing or API request fails
 * 
 * @example
 * const marketData = await getMarketDataFromFirebase([34, 35, 36]);
 * console.log(marketData); // Array of market data objects
 */
async function getMarketDataFromFirebase(inputArray) {
  try {
    if (!inputArray) {
      throw new Error("missing price input array");
    }

    const appCheckToken = await getToken(appCheck);
    const response = await fetch(`${getRuntimeEnv("API_URL")}/market-data`, {
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
        `Api request failed with status ${response.status}: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (err) {
    console.error(`Error retrieving market data: ${err}`);
    return [];
  }
}

export default getMarketDataFromFirebase;
