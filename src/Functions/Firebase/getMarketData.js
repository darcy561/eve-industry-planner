import { getToken } from "firebase/app-check";
import { appCheck } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";

async function getMarketDataFromFirebase(inputArray) {
  try {
    if (!inputArray) {
      throw new Error("missing price input array");
    }

    const appCheckToken = await getToken(appCheck);
    const response = await fetch(`${import.meta.env.VITE_APIURL}/market-data`, {
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
